"""Knowledge base router — document upload, indexing, and semantic query."""
import asyncio
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, BackgroundTasks
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import get_agent_or_404
from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.base import new_uuid
from app.models.document import Document, DocumentChunk
from app.models.user import User
from app.schemas.common import MessageResponse, PaginatedResponse

router = APIRouter(prefix="/kb", tags=["knowledge-base"])

ALLOWED_TYPES = {
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
}
MAX_FILE_BYTES = 20 * 1024 * 1024  # 20 MB


@router.get("/", response_model=PaginatedResponse[dict])
async def list_documents(
    agent_id: str | None = None,
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filters = [Document.user_id == current_user.id]
    if agent_id:
        filters.append(Document.agent_id == agent_id)

    offset = (page - 1) * page_size
    total = (await db.execute(select(func.count()).select_from(Document).where(*filters))).scalar()
    result = await db.execute(
        select(Document).where(*filters).order_by(Document.created_at.desc()).offset(offset).limit(page_size)
    )
    docs = result.scalars().all()
    items = [
        {
            "id": d.id,
            "filename": d.filename,
            "file_type": d.file_type,
            "file_size_bytes": d.file_size_bytes,
            "chunk_count": d.chunk_count,
            "status": d.status,
            "agent_id": d.agent_id,
            "created_at": d.created_at,
        }
        for d in docs
    ]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size, pages=(total + page_size - 1) // page_size)


@router.post("/", status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    agent_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    content_type = file.content_type or "text/plain"
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {content_type}")

    content = await file.read()
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 20 MB)")

    if agent_id:
        await get_agent_or_404(agent_id, current_user.id, db)

    doc = Document(
        id=new_uuid(),
        user_id=current_user.id,
        agent_id=agent_id,
        filename=file.filename or "upload",
        file_type=content_type,
        file_size_bytes=len(content),
        status="processing",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Ingest in background so the response is immediate
    background_tasks.add_task(_ingest_bg, doc.id, content)

    return {"id": doc.id, "filename": doc.filename, "status": "processing"}


@router.get("/{doc_id}")
async def get_document(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_doc_or_404(doc_id, current_user.id, db)
    return {
        "id": doc.id,
        "filename": doc.filename,
        "file_type": doc.file_type,
        "file_size_bytes": doc.file_size_bytes,
        "chunk_count": doc.chunk_count,
        "status": doc.status,
        "error_message": doc.error_message,
        "agent_id": doc.agent_id,
        "created_at": doc.created_at,
    }


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    doc = await _get_doc_or_404(doc_id, current_user.id, db)
    await db.delete(doc)
    await db.commit()


@router.post("/{doc_id}/query")
async def query_document(
    doc_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Semantic search within a specific document."""
    doc = await _get_doc_or_404(doc_id, current_user.id, db)
    if doc.status != "ready":
        raise HTTPException(status_code=400, detail="Document not ready")

    query = body.get("query", "")
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    from app.services.embedding_service import query_knowledge_base
    results = await query_knowledge_base(doc.agent_id or "", query, db)
    return {"results": results}


async def _get_doc_or_404(doc_id: str, user_id: str, db: AsyncSession) -> Document:
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == user_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


async def _ingest_bg(doc_id: str, content: bytes) -> None:
    from app.db.session import AsyncSessionLocal
    from app.services.embedding_service import ingest_document

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Document).where(Document.id == doc_id))
        doc = result.scalar_one_or_none()
        if doc:
            await ingest_document(doc, content, db)
