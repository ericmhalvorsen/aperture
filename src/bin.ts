#!/usr/bin/env node
import { ApertureServer } from "./server.js";

const port = Number(process.env.APERTURE_PORT) || 3456;
new ApertureServer(port);
console.error("Press Ctrl+C to stop");
