import * as aws from "@pulumi/aws";

export const logGroup = new aws.cloudwatch.LogGroup("nginx-log");

export const elasticStream = new aws.elasticsearch.Domain("nginx-log-stream", {
    clusterConfig: {
        instanceType: "t2.micro.elasticsearch",
    },
    ebsOptions: {
        ebsEnabled: true,
        volumeSize: 10,
    },
    elasticsearchVersion: "1.5",
});
