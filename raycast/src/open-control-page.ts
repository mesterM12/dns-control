import { closeMainWindow, open } from "@raycast/api";
import { controlPageUrl } from "./dns-control";

export default async function command() {
  await open(controlPageUrl);
  await closeMainWindow();
}
