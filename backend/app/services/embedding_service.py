"""Document ingestion: chunk → embed → store in pgvector."""
import io
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.base import new_uuid
from app.models.document import Document, DocumentChunk

log = structlog.get_logger(__name__)

CHUNK_SIZE = 512
CHUNK_OVERLAP = 64


def _chunk_text(text: str) -> list[str]:
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = min(start + CHUNK_SIZE, len(words))
        chunks.append(" ".join(words[start:end]))
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


def _extract_text(content: bytes, file_type: str) -> str:
    """Extract plain text from uploaded file bytes."""
    if file_type in ("text/plain", "text/csv"):
        return content.decode("utf-8", errors="replace")

    if file_type == "application/pdf":
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(content))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except ImportError:
            log.warning("pypdf_not_installed")
            return content.decode("utf-8", errors="replace")

    if file_type in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ):
        try:
            import docx
            doc = docx.Document(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs)
        except ImportError:
            log.warning("python_docx_not_installed")
            return content.decode("utf-8", errors="replace")

    return content.decode("utf-8", errors="replace")


async def _embed_texts(texts: list[str]) -> list[list[float]]:
    if not settings.openai_api_key:
        return [[0.0] * 1536 for _ in texts]

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response = await client.embeddings.create(
        model="text-embedding-3-small",
        input=texts,
    )
    return [item.embedding for item in response.data]


async def ingest_document(
    document: Document,
    content: bytes,
    db: AsyncSession,
) -> None:
    """Chunk, embed, and persist a document's content. Updates document.status."""
    try:
        text = _extract_text(content, document.file_type or "text/plain")
        chunks = _chunk_text(text)

        if not chunks:
            document.status = "failed"
            document.error_message = "No text content extracted"
            await db.commit()
            return

        embeddings = await _embed_texts(chunks)

        for i, (chunk_text, embedding) in enumerate(zip(chunks, embeddings)):
            chunk = DocumentChunk(
                id=new_uuid(),
                document_id=document.id,
                chunk_index=i,
                content=chunk_text,
                metadata_={"chunk_index": i, "document_id": document.id},
            )
            db.add(chunk)
            # Store embedding via raw SQL to use pgvector
            await db.flush()
            await db.execute(
                "UPDATE document_chunks SET embedding = :emb WHERE id = :id",
                {"emb": str(embedding), "id": chunk.id},
            )

        document.chunk_count = len(chunks)
        document.status = "ready"
        await db.commit()
        log.info("document_ingested", doc_id=document.id, chunks=len(chunks))

    except Exception as e:
        log.error("document_ingest_error", doc_id=document.id, error=str(e))
        document.status = "failed"
        document.error_message = str(e)
        await db.commit()


async def query_knowledge_base(
    agent_id: str,
    query: str,
    db: AsyncSession,
    top_k: int = 5,
) -> list[dict]:
    """Semantic search over document chunks for a given agent."""
    if not settings.openai_api_key:
        # Fallback: keyword search
        from sqlalchemy import select, text
        from app.models.document import Document, DocumentChunk
        result = await db.execute(
            select(DocumentChunk)
            .join(Document, Document.id == DocumentChunk.document_id)
            .where(Document.agent_id == agent_id, Document.status == "ready")
            .limit(top_k)
        )
        chunks = result.scalars().all()
        return [{"content": c.content, "score": 1.0} for c in chunks]

    embeddings = await _embed_texts([query])
    query_vec = embeddings[0]

    from sqlalchemy import text as sa_text
    result = await db.execute(
        sa_text("""
            SELECT dc.content, 1 - (dc.embedding <=> :vec) AS score
            FROM document_chunks dc
            JOIN documents d ON d.id = dc.document_id
            WHERE d.agent_id = :agent_id AND d.status = 'ready'
            ORDER BY dc.embedding <=> :vec
            LIMIT :top_k
        """),
        {"vec": str(query_vec), "agent_id": agent_id, "top_k": top_k},
    )
    return [{"content": row.content, "score": round(float(row.score), 4)} for row in result]
