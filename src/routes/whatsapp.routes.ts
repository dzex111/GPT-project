import { Router } from "express";
import { asyncHandler } from "../http/async-handler";
import { receiveWebhook, verifyWebhook } from "../controllers/whatsapp.controller";

export const whatsappRouter = Router();

whatsappRouter.get("/", asyncHandler(verifyWebhook));
whatsappRouter.post("/", asyncHandler(receiveWebhook));
