// Generates a throwaway local CA and a gateway certificate for *.preview.localhost,
// tunnel.localhost and 127.0.0.1 — for testing HTTPS locally. Requires `openssl` on PATH.
// Never use these files in production; use a real wildcard certificate there.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? ".localians-dev/certs");
fs.mkdirSync(dir, { recursive: true });
const p = (f) => path.join(dir, f);
const run = (...args) => execFileSync("openssl", args, { stdio: "pipe" });

if (fs.existsSync(p("gateway.crt")) && fs.existsSync(p("ca.crt"))) {
  console.log(`Certificates already exist in ${dir}`);
  process.exit(0);
}

fs.writeFileSync(
  p("gateway.ext"),
  [
    "basicConstraints=CA:FALSE",
    "keyUsage=digitalSignature,keyEncipherment",
    "extendedKeyUsage=serverAuth",
    "subjectAltName=DNS:*.preview.localhost,DNS:preview.localhost,DNS:tunnel.localhost,IP:127.0.0.1",
  ].join("\n"),
);

run("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "30", "-subj", "/CN=Localians Local Dev CA", "-keyout", p("ca.key"), "-out", p("ca.crt"));
run("req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=*.preview.localhost", "-keyout", p("gateway.key"), "-out", p("gateway.csr"));
run("x509", "-req", "-in", p("gateway.csr"), "-CA", p("ca.crt"), "-CAkey", p("ca.key"), "-CAcreateserial", "-days", "30", "-extfile", p("gateway.ext"), "-out", p("gateway.crt"));

console.log(`Wrote local CA and gateway certificate to ${dir}`);
