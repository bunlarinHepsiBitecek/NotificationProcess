// neo4j connection configurations
let uri = process.env.NEO4J_URL;
exports.uri = uri;
let user = process.env.NEO4J_USER;
exports.user = user;
let password = process.env.NEO4J_PASSWORD;
exports.password = password;
// sns platform applications arn informations
let ios_sns_arn = process.env.SNS_IOS_PLATFORM_APPLICATION_ARN;
let android_sns_arn = process.env.SNS_ANDROID_PLATFORM_APPLICATION_ARN;
// notification loc-key for Localizable.strings
let followRequestLocKey = process.env.FOLLOW_REQUEST_LOC_KEY;
exports.followRequestLocKey = followRequestLocKey;
let directFollowRequestLocKey = process.env.DIRECT_FOLLOW_REQUEST_LOC_KEY;
exports.directFollowRequestLocKey = directFollowRequestLocKey;
let groupCreateLocKey = process.env.GROUP_CREATE_LOC_KEY;
exports.groupCreateLocKey = groupCreateLocKey;
