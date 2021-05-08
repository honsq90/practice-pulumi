import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const logStreamName = "nginx-log-stream";

export const elasticStream = new aws.elasticsearch.Domain(logStreamName, {
    clusterConfig: {
        instanceType: "t2.micro.elasticsearch",
    },
    ebsOptions: {
        ebsEnabled: true,
        volumeSize: 10,
    },
    elasticsearchVersion: "1.5",
});

const elasticStreamLambdaIamPolicy = new aws.iam.Policy(`${logStreamName}-lambda-policy`, {
    policy: {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Action": [
                    "es:*",
                ],
                "Effect": "Allow",
                "Resource": pulumi.interpolate`${elasticStream.arn}/*`,
            },
        ],
    },
});

const elasticStreamLambdaIamRole = new aws.iam.Role(`${logStreamName}-lambda-role`, {
    assumeRolePolicy: {
        "Version": "2012-10-17",
        "Statement": [
            {
                Action: ['sts:AssumeRole'],
                Effect: "Allow",
                Principal: {
                    Service: ["lambda.amazonaws.com"],
                },
            },
        ],
    },
});

const elasticStreamLambdaIamRolePolicy = new aws.iam.RolePolicy(`${logStreamName}-lambda-role-policy`, {
    role: elasticStreamLambdaIamRole,
    policy: elasticStreamLambdaIamPolicy.policy,
});

const logStreamLambda = new aws.lambda.Function(`LogsToElasticsearch-${logStreamName}`, {
    handler: "index.handler",
    runtime: "nodejs12.x",
    role: elasticStreamLambdaIamRole.arn,
    // relative to Pulumi.yaml
    code: new pulumi.asset.FileArchive("logging/LogsToElasticSearch"),
    description: "Ships logs from Cloudwatch to ElasticSearch",
    environment: {
        variables: {
            ES_ENDPOINT: elasticStream.endpoint,
        },
    },
});

const cloudwatchLogGroup = "nginx-log";
export const logGroup = new aws.cloudwatch.LogGroup(cloudwatchLogGroup);

new aws.cloudwatch.LogSubscriptionFilter(`${cloudwatchLogGroup}-subscription-filter`, {
    destinationArn: logStreamLambda.arn,
    filterPattern: "",
    logGroup: logGroup
})