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
import { deleteAccount } from "../controllers/accountController";
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
// Permanently (hard) deletes the account and all of its data. Does its own
// token check so a retry after success is idempotent (see controller).
router.delete("/account", deleteAccount);

export default router;
