import { Router } from "express";
import {
  getCurrentUser,
  googleLogin,
  login,
  logout,
  requestMobileOtp,
  refreshToken,
  resetPassword,
  setPassword,
  signup,
  verifyMobileOtp,
} from "../controllers/authController";
import { requireAuth } from "../middleware/authMiddleware";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/google", googleLogin);
router.post("/mobile/request-otp", requestMobileOtp);
router.post("/mobile/verify-otp", verifyMobileOtp);
router.post("/refresh", refreshToken);
router.post("/reset-password", resetPassword);
router.post("/set-password", requireAuth, setPassword);
router.get("/me", requireAuth, getCurrentUser);
router.post("/logout", logout);

export default router;
