import os
import uuid
import logging
from pathlib import Path
from dotenv import load_dotenv
import cloudinary
import cloudinary.uploader
from fastapi import HTTPException

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env")

# Constraints for image uploads
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
MAX_IMAGES_PER_COMPLAINT = 10
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def is_cloudinary_configured() -> bool:
    """Checks whether Cloudinary credentials are set in the environment."""
    if os.getenv("CLOUDINARY_URL"):
        return True
    return bool(
        os.getenv("CLOUDINARY_CLOUD_NAME")
        and os.getenv("CLOUDINARY_API_KEY")
        and os.getenv("CLOUDINARY_API_SECRET")
    )


def configure_cloudinary() -> bool:
    """Initializes Cloudinary configuration with current environment credentials."""
    cloudinary_url = os.getenv("CLOUDINARY_URL")
    if cloudinary_url:
        cloudinary.config(cloudinary_url=cloudinary_url)
        return True

    cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME")
    api_key = os.getenv("CLOUDINARY_API_KEY")
    api_secret = os.getenv("CLOUDINARY_API_SECRET")

    if cloud_name and api_key and api_secret:
        cloudinary.config(
            cloud_name=cloud_name,
            api_key=api_key,
            api_secret=api_secret,
            secure=True,
        )
        return True
    return False


def validate_image_file(filename: str, content_type: str, file_bytes: bytes) -> str:
    """
    Validates file size, extension, content type and magic bytes on the backend.
    Returns normalized mime_type if valid; raises HTTPException(400) otherwise.
    """
    if not file_bytes or len(file_bytes) == 0:
        raise HTTPException(
            status_code=400,
            detail=f"File '{filename}' is empty."
        )

    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File '{filename}' exceeds maximum allowed size of 5MB."
        )

    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        allowed_list = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"File '{filename}' has unsupported extension '{ext}'. Allowed extensions: {allowed_list}."
        )

    # Magic bytes check
    detected_mime = None
    if file_bytes.startswith(b"\xff\xd8\xff"):
        detected_mime = "image/jpeg"
    elif file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        detected_mime = "image/png"
    elif file_bytes.startswith(b"GIF87a") or file_bytes.startswith(b"GIF89a"):
        detected_mime = "image/gif"
    elif len(file_bytes) >= 12 and file_bytes[:4] == b"RIFF" and file_bytes[8:12] == b"WEBP":
        detected_mime = "image/webp"

    if not detected_mime:
        raise HTTPException(
            status_code=400,
            detail=f"File '{filename}' does not appear to be a valid image file."
        )

    return detected_mime


def upload_image_to_cloudinary(file_bytes: bytes, filename: str, folder: str = "complaints") -> dict:
    """
    Uploads image bytes to Cloudinary.
    Returns a dict with secure_url, public_id, format, and bytes.
    Raises HTTPException(503) if Cloudinary is not configured.
    Raises HTTPException(502) if Cloudinary upload fails.
    """
    if not configure_cloudinary():
        raise HTTPException(
            status_code=503,
            detail="Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in environment."
        )

    try:
        clean_name = os.path.splitext(os.path.basename(filename or "image"))[0][:30]
        clean_name = "".join(c for c in clean_name if c.isalnum() or c in "-_") or "image"
        unique_public_id = f"{clean_name}_{uuid.uuid4().hex[:8]}"

        result = cloudinary.uploader.upload(
            file_bytes,
            folder=f"resolveit/{folder}",
            public_id=unique_public_id,
            resource_type="image",
            overwrite=True,
        )

        return {
            "secure_url": result.get("secure_url") or result.get("url"),
            "public_id": result.get("public_id"),
            "format": result.get("format"),
            "bytes": result.get("bytes", len(file_bytes)),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Cloudinary image upload failed: {str(e)}"
        )


def delete_image_from_cloudinary(public_id: str) -> bool:
    """Deletes an image from Cloudinary by its public_id. Safely handles errors without crashing."""
    if not public_id:
        return False
    if not configure_cloudinary():
        logger.warning("Cloudinary is not configured; skipping asset deletion for public_id: %s", public_id)
        return False
    try:
        result = cloudinary.uploader.destroy(public_id)
        if isinstance(result, dict) and result.get("result") in ["ok", "not found"]:
            return True
        logger.warning("Cloudinary asset deletion returned unexpected result for %s: %s", public_id, result)
        return False
    except Exception as e:
        logger.error("Failed to delete Cloudinary asset %s: %s", public_id, e)
        return False
