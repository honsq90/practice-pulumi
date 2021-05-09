import * as pulumi from "@pulumi/pulumi";
import * as awsx from "@pulumi/awsx";
import { cloudwatchLogGroup, elasticStream, logStreamLambda } from "./logging/elasticsearch";

// Create a load balancer to listen for requests and route them to the container.
const listener = new awsx.elasticloadbalancingv2.NetworkListener("nginx", { port: 80 });

// Define the service, building and publishing our "./app/Dockerfile", and using the load balancer.
const service = new awsx.ecs.FargateService("nginx", {
    desiredCount: 2,
    taskDefinitionArgs: {
        logGroup: cloudwatchLogGroup,
        containers: {
            nginx: {
                image: awsx.ecs.Image.fromPath("nginx", "./app"),
                memory: 512,
                portMappings: [listener],
            },
        },
    },
});

// Export the URL so we can easily access it.
export const frontendURL = pulumi.interpolate`http://${listener.endpoint.hostname}`;
export const kibanaUrl =  pulumi.interpolate`https://${elasticStream.kibanaEndpoint}`;
export const elasticStreamArn = elasticStream.arn;
export const lambdaArn = logStreamLambda.arn;
export const lambdaName = logStreamLambda.name;
