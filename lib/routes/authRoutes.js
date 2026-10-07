"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const accountController_1 = require("../controllers/accountController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.post("/signup", authController_1.signup);
router.post("/login", authController_1.login);
router.post("/google", authController_1.googleLogin);
router.post("/apple", authController_1.appleLogin);
router.get("/config", authController_1.getAuthConfig);
router.post("/mobile/request-otp", authController_1.requestMobileOtp);
router.post("/mobile/verify-otp", authController_1.verifyMobileOtp);
router.post("/refresh", authController_1.refreshToken);
router.post("/forgot-password", authController_1.forgotPassword);
router.post("/reset-password", authController_1.resetPassword);
router.post("/email/verify", authController_1.verifyEmail);
router.post("/email/resend", authController_1.resendVerificationEmail);
router.post("/set-password", authMiddleware_1.requireAuth, authController_1.setPassword);
router.get("/me", authMiddleware_1.requireAuth, authController_1.getCurrentUser);
router.post("/logout", authController_1.logout);
// Permanently (hard) deletes the account and all of its data. Does its own
// token check so a retry after success is idempotent (see controller).
router.delete("/account", accountController_1.deleteAccount);
exports.default = router;
//# sourceMappingURL=authRoutes.js.map