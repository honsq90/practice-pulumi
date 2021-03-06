import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const nameElasticNginxLogStream = "nginx-log-stream";
const nameCloudwatchLogGroup = "nginx-log";
const nameLogGroupSubscriptionFilter = `${nameCloudwatchLogGroup}-subscription-filter`;
const current = aws.getCallerIdentity({});
export const accountId = current.then(current => current.accountId);
export const region = aws.getRegion().then(region => region.name);

const config = new pulumi.Config("whitelist");
const ipAddress = config.requireSecret("ipAddress");

export const elasticStream = new aws.elasticsearch.Domain(nameElasticNginxLogStream, {
    clusterConfig: {
        instanceType: "t2.micro.elasticsearch",
    },
    ebsOptions: {
        ebsEnabled: true,
        volumeSize: 10,
    },
    elasticsearchVersion: "1.5",
    accessPolicies: {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "AWS": ["*"],
                },
                "Action": [
                    "es:ESHttp*",
                ],
                "Condition": {
                    "IpAddress": {
                        "aws:SourceIp": [
                            pulumi.interpolate`${ipAddress}/24`,
                        ],
                    },
                },
            },
        ],
    }
});

export const cloudwatchLogGroup = new aws.cloudwatch.LogGroup(nameCloudwatchLogGroup, {
    retentionInDays: 7,
});

const elasticStreamLambdaIamRole = new aws.iam.Role(`${nameElasticNginxLogStream}-lambda-role`, {
    assumeRolePolicy: {
        "Version": "2012-10-17",
        "Statement": [
            {
                Action: ["sts:AssumeRole"],
                Effect: "Allow",
                Principal: {
                    Service: ["lambda.amazonaws.com"],
                },
            },
        ],
    },
    managedPolicyArns: [
        "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    ]
});

new aws.iam.RolePolicy(`${nameElasticNginxLogStream}-lambda-role-elastic-policy`, {
    role: elasticStreamLambdaIamRole,
    policy: {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Action": ["es:*"],
                "Effect": "Allow",
                "Resource": pulumi.interpolate`${elasticStream.arn}/*`,
            },
        ],
    },
});

new aws.iam.RolePolicy(`${nameElasticNginxLogStream}-lambda-role-invoke-policy`, {
    role: elasticStreamLambdaIamRole,
    policy: {
        "Version": "2012-10-17",
        "Statement": [
            {
                Action: ["lambda:InvokeFunction"],
                Effect: "Allow",
                Resource: ["*"],
            },
        ],
    },
});

export const logStreamLambda = new aws.lambda.Function(`LogsToElasticsearch-${nameElasticNginxLogStream}`, {
    handler: "index.handler",
    runtime: "nodejs12.x",
    role: elasticStreamLambdaIamRole.arn,
    // relative to Pulumi.yaml
    code: new pulumi.asset.FileArchive("logging/LogsToElasticSearch"),
    description: "Ships logs from Cloudwatch to ElasticSearch",
    timeout: 15,
    environment: {
        variables: {
            ES_ENDPOINT: elasticStream.endpoint,
        },
    },
});

const logStreamLambdaInvokePermission = new aws.lambda.Permission(`${nameCloudwatchLogGroup}-invoke-permission`, {
    action: "lambda:InvokeFunction",
    function: logStreamLambda.name,
    principal: pulumi.interpolate`logs.${region}.amazonaws.com`,
    sourceArn: pulumi.interpolate`${cloudwatchLogGroup.arn}:*`,
    sourceAccount: accountId,
}, {
    dependsOn: [logStreamLambda],
});

new aws.cloudwatch.LogSubscriptionFilter(nameLogGroupSubscriptionFilter, {
    destinationArn: pulumi.interpolate`${logStreamLambda.arn}`,
    filterPattern: "",
    logGroup: cloudwatchLogGroup,
}, { dependsOn: [logStreamLambdaInvokePermission, logStreamLambda] });
