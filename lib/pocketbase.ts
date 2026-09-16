import PocketBase from "pocketbase";

const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || "";

export const pb = new PocketBase(POCKETBASE_URL);
pb.autoCancellation(false);
