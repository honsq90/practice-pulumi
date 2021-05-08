import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const nameNginxLogStream = "nginx-log-stream";
const nameCloudwatchLogGroup = "nginx-log";
const nameLogGroupSubscriptionFilter = `${nameCloudwatchLogGroup}-subscription-filter`;
const current = aws.getCallerIdentity({});
export const accountId = current.then(current => current.accountId);

export const elasticStream = new aws.elasticsearch.Domain(nameNginxLogStream, {
    clusterConfig: {
        instanceType: "t2.micro.elasticsearch",
    },
    ebsOptions: {
        ebsEnabled: true,
        volumeSize: 10,
    },
    elasticsearchVersion: "1.5",
});

export const cloudwatchLogGroup = new aws.cloudwatch.LogGroup(nameCloudwatchLogGroup,{
    retentionInDays: 7,
});

const elasticStreamLambdaIamRole = new aws.iam.Role(`${nameNginxLogStream}-lambda-role`, {
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

new aws.iam.RolePolicy(`${nameNginxLogStream}-lambda-role-elastic-policy`, {
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

new aws.iam.RolePolicy(`${nameNginxLogStream}-lambda-role-invoke-policy`, {
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

export const logStreamLambda = new aws.lambda.Function(`LogsToElasticsearch-${nameNginxLogStream}`, {
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
    // requires the region of the log service
    principal: "logs.ap-southeast-2.amazonaws.com",
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
