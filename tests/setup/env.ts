import { TEST_ENV } from "./test-env";

// Applied before any test module imports server code.
Object.assign(process.env, TEST_ENV);
