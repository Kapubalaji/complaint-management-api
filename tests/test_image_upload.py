import io
import os
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-for-image-tests-32bytes"

from backend.database import Base
from backend.server import app
from backend.models.user import User
from backend.models.complaint import Complaint, ComplaintImage
from backend.security import hash_password, create_access_token

test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

# Small valid PNG image bytes (1x1 pixel)
VALID_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)

# Small valid JPEG bytes
VALID_JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00" + b"\x00" * 64 + b"\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"


class TestImageUploads(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(bind=test_engine)

        import backend.database as db_mod
        import backend.routers.users as users_router
        import backend.routers.complaints as complaints_router
        import backend.security as sec_mod

        db_mod.engine = test_engine
        users_router.engine = test_engine
        complaints_router.engine = test_engine
        sec_mod.engine = test_engine

        self.client = TestClient(app)

    def tearDown(self):
        Base.metadata.drop_all(bind=test_engine)

    def create_user(self, username: str, role: str = "user", email: str = None) -> User:
        session = TestingSessionLocal()
        user = User(
            username=username,
            password=hash_password("password123"),
            email=email or f"{username}@example.com",
            full_name=f"{username.capitalize()} User",
            role=role,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        session.close()
        return user

    def get_token(self, username: str, role: str = "user") -> str:
        return create_access_token(username, role)

    def create_complaint(self, user_id: int, assigned_staff_id: int = None, title: str = "Leaking pipe") -> int:
        session = TestingSessionLocal()
        complaint = Complaint(
            title=title,
            description="Detailed description of the issue.",
            status="open",
            category="Plumbing",
            priority="High",
            user_id=user_id,
            assigned_staff_id=assigned_staff_id,
        )
        session.add(complaint)
        session.commit()
        session.refresh(complaint)
        cid = complaint.id
        session.close()
        return cid

    # --- Validation Tests ---

    def test_upload_without_auth_fails(self):
        resp = self.client.post("/complaints/1/images")
        self.assertEqual(resp.status_code, 401)

    def test_upload_invalid_image_type_fails(self):
        user = self.create_user("resident1", "user")
        token = self.get_token(user.username, user.role)
        cid = self.create_complaint(user.id)

        files = [("files", ("test.png", io.BytesIO(VALID_PNG_BYTES), "image/png"))]
        data = {"image_type": "invalid_type"}
        resp = self.client.post(
            f"/complaints/{cid}/images",
            headers={"Authorization": f"Bearer {token}"},
            files=files,
            data=data,
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Invalid image_type", resp.json()["detail"])

    def test_upload_file_size_limit_exceeded(self):
        user = self.create_user("resident1", "user")
        token = self.get_token(user.username, user.role)
        cid = self.create_complaint(user.id)

        # 5MB + 1 byte
        huge_bytes = b"\x89PNG\r\n\x1a\n" + b"0" * (5 * 1024 * 1024 + 1)
        files = [("files", ("huge.png", io.BytesIO(huge_bytes), "image/png"))]
        resp = self.client.post(
            f"/complaints/{cid}/images",
            headers={"Authorization": f"Bearer {token}"},
            files=files,
            data={"image_type": "issue"},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("exceeds maximum allowed size of 5MB", resp.json()["detail"])

    def test_upload_unsupported_file_extension(self):
        user = self.create_user("resident1", "user")
        token = self.get_token(user.username, user.role)
        cid = self.create_complaint(user.id)

        files = [("files", ("test.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf"))]
        resp = self.client.post(
            f"/complaints/{cid}/images",
            headers={"Authorization": f"Bearer {token}"},
            files=files,
            data={"image_type": "issue"},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("unsupported extension", resp.json()["detail"])

    def test_upload_fake_image_magic_bytes_fails(self):
        user = self.create_user("resident1", "user")
        token = self.get_token(user.username, user.role)
        cid = self.create_complaint(user.id)

        # Renamed text file
        files = [("files", ("evil.jpg", io.BytesIO(b"This is not a real jpeg file"), "image/jpeg"))]
        resp = self.client.post(
            f"/complaints/{cid}/images",
            headers={"Authorization": f"Bearer {token}"},
            files=files,
            data={"image_type": "issue"},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("does not appear to be a valid image", resp.json()["detail"])

    # --- Role & Permissions Tests ---

    def test_resident_cannot_upload_repair_image(self):
        user = self.create_user("resident1", "user")
        token = self.get_token(user.username, user.role)
        cid = self.create_complaint(user.id)

        files = [("files", ("proof.png", io.BytesIO(VALID_PNG_BYTES), "image/png"))]
        resp = self.client.post(
            f"/complaints/{cid}/images",
            headers={"Authorization": f"Bearer {token}"},
            files=files,
            data={"image_type": "repair"},
        )
        self.assertEqual(resp.status_code, 403)
        self.assertIn("Only staff and admin can upload repair completion photos", resp.json()["detail"])

    def test_resident_cannot_upload_to_other_resident_complaint(self):
        user1 = self.create_user("resident1", "user")
        user2 = self.create_user("resident2", "user")
        token2 = self.get_token(user2.username, user2.role)
        cid1 = self.create_complaint(user1.id)

        files = [("files", ("issue.png", io.BytesIO(VALID_PNG_BYTES), "image/png"))]
        resp = self.client.post(
            f"/complaints/{cid1}/images",
            headers={"Authorization": f"Bearer {token2}"},
            files=files,
            data={"image_type": "issue"},
        )
        self.assertEqual(resp.status_code, 404)

    # --- Cloudinary Upload and DB Storage Tests ---

    @patch("backend.routers.complaints.upload_image_to_cloudinary")
    def test_resident_uploads_issue_images_successfully(self, mock_upload):
        mock_upload.return_value = {
            "secure_url": "https://res.cloudinary.com/demo/image/upload/v1234/resolveit/issue.png",
            "public_id": "resolveit/complaint_1/issue_123",
            "format": "png",
            "bytes": len(VALID_PNG_BYTES),
        }

        user = self.create_user("resident1", "user")
        token = self.get_token(user.username, user.role)
        cid = self.create_complaint(user.id)

        files = [
            ("files", ("photo1.png", io.BytesIO(VALID_PNG_BYTES), "image/png")),
            ("files", ("photo2.jpg", io.BytesIO(VALID_JPEG_BYTES), "image/jpeg")),
        ]
        resp = self.client.post(
            f"/complaints/{cid}/images",
            headers={"Authorization": f"Bearer {token}"},
            files=files,
            data={"image_type": "issue"},
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["image_type"], "issue")
        self.assertEqual(data[0]["image_url"], "https://res.cloudinary.com/demo/image/upload/v1234/resolveit/issue.png")
        self.assertEqual(data[0]["complaint_id"], cid)

        # Check that GET /complaints/{id} includes the images
        complaint_resp = self.client.get(
            f"/complaints/{cid}",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(complaint_resp.status_code, 200)
        complaint_data = complaint_resp.json()
        self.assertEqual(len(complaint_data["images"]), 2)

    @patch("backend.routers.complaints.upload_image_to_cloudinary")
    def test_staff_uploads_repair_photos_to_assigned_complaint(self, mock_upload):
        mock_upload.return_value = {
            "secure_url": "https://res.cloudinary.com/demo/image/upload/v1234/resolveit/repair.png",
            "public_id": "resolveit/complaint_1/repair_456",
            "format": "png",
            "bytes": len(VALID_PNG_BYTES),
        }

        user = self.create_user("resident1", "user")
        staff = self.create_user("technician1", "staff")
        staff_token = self.get_token(staff.username, staff.role)
        cid = self.create_complaint(user.id, assigned_staff_id=staff.id)

        files = [("files", ("repair_done.png", io.BytesIO(VALID_PNG_BYTES), "image/png"))]
        resp = self.client.post(
            f"/complaints/{cid}/images",
            headers={"Authorization": f"Bearer {staff_token}"},
            files=files,
            data={"image_type": "repair"},
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["image_type"], "repair")
        self.assertEqual(data[0]["public_id"], "resolveit/complaint_1/repair_456")

        # Staff can list images
        get_resp = self.client.get(
            f"/complaints/{cid}/images",
            headers={"Authorization": f"Bearer {staff_token}"},
        )
        self.assertEqual(get_resp.status_code, 200)
        self.assertEqual(len(get_resp.json()), 1)

        # Resident can also view this repair image on their own complaint!
        user_token = self.get_token(user.username, user.role)
        res_get = self.client.get(
            f"/complaints/{cid}/images",
            headers={"Authorization": f"Bearer {user_token}"},
        )
        self.assertEqual(res_get.status_code, 200)
        self.assertEqual(len(res_get.json()), 1)
        self.assertEqual(res_get.json()[0]["image_type"], "repair")

    @patch("backend.routers.complaints.upload_image_to_cloudinary")
    def test_staff_cannot_upload_to_unassigned_complaint(self, mock_upload):
        user = self.create_user("resident1", "user")
        staff1 = self.create_user("staff1", "staff")
        staff2 = self.create_user("staff2", "staff")
        staff2_token = self.get_token(staff2.username, staff2.role)

        # Complaint is assigned to staff1, not staff2
        cid = self.create_complaint(user.id, assigned_staff_id=staff1.id)

        files = [("files", ("repair.png", io.BytesIO(VALID_PNG_BYTES), "image/png"))]
        resp = self.client.post(
            f"/complaints/{cid}/images",
            headers={"Authorization": f"Bearer {staff2_token}"},
            files=files,
            data={"image_type": "repair"},
        )
        # Staff 2 cannot access complaints not assigned to them
        self.assertEqual(resp.status_code, 404)

    @patch("backend.routers.complaints.upload_image_to_cloudinary")
    def test_max_images_limit_enforced(self, mock_upload):
        mock_upload.return_value = {
            "secure_url": "https://res.cloudinary.com/demo/image/upload/test.png",
            "public_id": "resolveit/test",
            "format": "png",
            "bytes": len(VALID_PNG_BYTES),
        }

        admin = self.create_user("admin", "admin")
        admin_token = self.get_token(admin.username, admin.role)
        cid = self.create_complaint(admin.id)

        # Pre-populate 9 images in DB
        session = TestingSessionLocal()
        for i in range(9):
            img = ComplaintImage(
                complaint_id=cid,
                user_id=admin.id,
                image_url=f"https://cloudinary.com/image_{i}.png",
                image_type="issue",
            )
            session.add(img)
        session.commit()
        session.close()

        # Uploading 2 images exceeds limit of 10
        files = [
            ("files", ("img1.png", io.BytesIO(VALID_PNG_BYTES), "image/png")),
            ("files", ("img2.png", io.BytesIO(VALID_PNG_BYTES), "image/png")),
        ]
        resp = self.client.post(
            f"/complaints/{cid}/images",
            headers={"Authorization": f"Bearer {admin_token}"},
            files=files,
            data={"image_type": "issue"},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("at most 10 images", resp.json()["detail"])

    @patch("backend.routers.complaints.delete_image_from_cloudinary")
    @patch("backend.routers.complaints.upload_image_to_cloudinary")
    def test_delete_image(self, mock_upload, mock_delete):
        mock_upload.return_value = {
            "secure_url": "https://res.cloudinary.com/demo/test.png",
            "public_id": "resolveit/to_delete_1",
            "format": "png",
            "bytes": len(VALID_PNG_BYTES),
        }

        user = self.create_user("resident1", "user")
        token = self.get_token(user.username, user.role)
        cid = self.create_complaint(user.id)

        files = [("files", ("photo.png", io.BytesIO(VALID_PNG_BYTES), "image/png"))]
        upload_resp = self.client.post(
            f"/complaints/{cid}/images",
            headers={"Authorization": f"Bearer {token}"},
            files=files,
            data={"image_type": "issue"},
        )
        img_id = upload_resp.json()[0]["id"]

        # Delete image as owner
        del_resp = self.client.delete(
            f"/complaints/{cid}/images/{img_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(del_resp.status_code, 200)
        mock_delete.assert_called_with("resolveit/to_delete_1")

        # Confirm deleted from DB
        get_resp = self.client.get(
            f"/complaints/{cid}/images",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(len(get_resp.json()), 0)

    @patch("backend.routers.complaints.delete_image_from_cloudinary")
    @patch("backend.routers.complaints.upload_image_to_cloudinary")
    def test_delete_image_permissions_matrix(self, mock_upload, mock_delete):
        mock_upload.side_effect = [
            {
                "secure_url": "https://res.cloudinary.com/issue.png",
                "public_id": "resolveit/issue_pub",
                "format": "png",
                "bytes": len(VALID_PNG_BYTES),
            },
            {
                "secure_url": "https://res.cloudinary.com/repair.png",
                "public_id": "resolveit/repair_pub",
                "format": "png",
                "bytes": len(VALID_PNG_BYTES),
            },
        ]

        resident = self.create_user("res_matrix", "user")
        staff = self.create_user("staff_matrix", "staff")
        admin = self.create_user("admin_matrix", "admin")
        stranger = self.create_user("stranger_matrix", "user")

        res_token = self.get_token(resident.username, resident.role)
        staff_token = self.get_token(staff.username, staff.role)
        admin_token = self.get_token(admin.username, admin.role)
        stranger_token = self.get_token(stranger.username, stranger.role)

        cid = self.create_complaint(resident.id, assigned_staff_id=staff.id)

        # 1. Resident uploads issue image
        res_upload = self.client.post(
            f"/complaints/{cid}/images",
            headers={"Authorization": f"Bearer {res_token}"},
            files=[("files", ("issue.png", io.BytesIO(VALID_PNG_BYTES), "image/png"))],
            data={"image_type": "issue"},
        )
        issue_img_id = res_upload.json()[0]["id"]

        # 2. Staff uploads repair image
        staff_upload = self.client.post(
            f"/complaints/{cid}/images",
            headers={"Authorization": f"Bearer {staff_token}"},
            files=[("files", ("repair.png", io.BytesIO(VALID_PNG_BYTES), "image/png"))],
            data={"image_type": "repair"},
        )
        repair_img_id = staff_upload.json()[0]["id"]

        # Test A: Stranger cannot delete anything (404, complaint out of scope)
        resp = self.client.delete(
            f"/complaints/{cid}/images/{issue_img_id}",
            headers={"Authorization": f"Bearer {stranger_token}"},
        )
        self.assertEqual(resp.status_code, 404)

        # Test B: Staff cannot delete resident's issue image (403 Forbidden)
        resp = self.client.delete(
            f"/complaints/{cid}/images/{issue_img_id}",
            headers={"Authorization": f"Bearer {staff_token}"},
        )
        self.assertEqual(resp.status_code, 403)
        self.assertIn("Not authorized to delete this image", resp.json()["detail"])

        # Test C: Resident cannot delete staff's repair image (403 Forbidden)
        resp = self.client.delete(
            f"/complaints/{cid}/images/{repair_img_id}",
            headers={"Authorization": f"Bearer {res_token}"},
        )
        self.assertEqual(resp.status_code, 403)
        self.assertIn("Not authorized to delete this image", resp.json()["detail"])

        # Test D: Admin CAN delete resident's issue image (200 OK)
        resp = self.client.delete(
            f"/complaints/{cid}/images/{issue_img_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(resp.status_code, 200)

        # Test E: Staff uploader CAN delete their own repair image (200 OK)
        resp = self.client.delete(
            f"/complaints/{cid}/images/{repair_img_id}",
            headers={"Authorization": f"Bearer {staff_token}"},
        )
        self.assertEqual(resp.status_code, 200)

    @patch("backend.routers.complaints.delete_image_from_cloudinary")
    @patch("backend.routers.complaints.upload_image_to_cloudinary")
    def test_delete_complaint_cleans_up_cloudinary_assets(self, mock_upload, mock_delete):
        mock_upload.return_value = {
            "secure_url": "https://res.cloudinary.com/complaint_img.png",
            "public_id": "resolveit/complaint_asset_99",
            "format": "png",
            "bytes": len(VALID_PNG_BYTES),
        }

        user = self.create_user("owner_del", "user")
        token = self.get_token(user.username, user.role)
        cid = self.create_complaint(user.id)

        self.client.post(
            f"/complaints/{cid}/images",
            headers={"Authorization": f"Bearer {token}"},
            files=[("files", ("shot.png", io.BytesIO(VALID_PNG_BYTES), "image/png"))],
            data={"image_type": "issue"},
        )

        del_complaint_resp = self.client.delete(
            f"/complaints/{cid}",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(del_complaint_resp.status_code, 200)
        mock_delete.assert_called_with("resolveit/complaint_asset_99")
