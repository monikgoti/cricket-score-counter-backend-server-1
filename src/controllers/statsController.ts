import type { Request, Response } from "express";
import { User } from "../models/User";
import { getActiveUserCount } from "../utils/socketState";

export const getStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = getActiveUserCount();

    res.status(200).json({
      totalUsers,
      activeUsers,
    });
  } catch (error) {
    console.error("Failed to fetch stats", error);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
};
