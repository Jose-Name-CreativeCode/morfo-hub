import { createApp } from "../server/src/app.js";

const app = createApp();

export default function handler(request, response) {
  return app(request, response);
}
