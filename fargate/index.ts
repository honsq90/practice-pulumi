import * as pulumi from "@pulumi/pulumi";
import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";

// Create a load balancer to listen for requests and route them to the container.
const listener = new awsx.elasticloadbalancingv2.NetworkListener("nginx", { port: 80 });

const logGroup = new aws.cloudwatch.LogGroup("nginx-log")

const elasticStream = new aws.elasticsearch.Domain("nginx-log-stream", {
    clusterConfig: {
        instanceType: "t2.micro.elasticsearch",
    },
    ebsOptions: {
        ebsEnabled: true,
        volumeSize: 10,
    },
    elasticsearchVersion: "1.5",
})

// Define the service, building and publishing our "./app/Dockerfile", and using the load balancer.
const service = new awsx.ecs.FargateService("nginx", {
    desiredCount: 2,
    taskDefinitionArgs: {
        logGroup: logGroup,
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
export const frontendURL = pulumi.interpolate `https://${listener.endpoint.hostname}/`;

export const kibanaUrl = elasticStream.kibanaEndpoint

export const serviceArn = service.urn
