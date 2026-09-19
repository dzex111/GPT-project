import { withLambda } from "@netlify/aws-lambda-compat";
import serverless from "serverless-http";
import { app } from "../../src/app";

export default withLambda(serverless(app));
