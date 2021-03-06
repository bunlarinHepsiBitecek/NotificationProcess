const NOTIFICATION_REQUEST_TYPE = {
	followRequest: "followRequest",
	createFollowDirectly: "createFollowDirectly",
	add_participant_into_group : "ADD_PARTICIPANT_INTO_GROUP",

	// added getter, setter
	_create_group : "CREATE_GROUP",
	
	get create_group() {
		return this._create_group;
	},
	set create_group(value) {
		this._create_group = value;
	},
};
exports.NOTIFICATION_REQUEST_TYPE = NOTIFICATION_REQUEST_TYPE;
const ERROR_TYPES = {
	// invalid input parameters
	INVALID_HTTP_METHOD: -100,
	INVALID_REQUEST_TYPE: -101,
	INVALID_USERID: -102,
	INVALID_DEVICE_TOKEN: -103,
	INVALID_PLATFORM_TYPE: -104,
	INVALID_EVENT_BODY: -105,
	INVALID_PATH: -106,
	INVALID_REQUESTER_NAME_INFO: -107,
	INVALID_RECEIVER_COUNT: -108,
	INVALID_ADDITIONAL_DATA: -109,

	// missing data informations
	MISSING_GROUP_INFO: -200,
	MISSING_GROUP_PARTICIPANTS: -201,
	MISSING_GROUP_CREATOR_INFO: -202,

	// for mapping sns module errors
	FAILED_GETTING_ENDPOINTS: -300,
	FAILED_SENDING_PUSH_NOTIFICATION:-301,
	FAILED_SNS_CREATE_ENDPOINT: -302,
	FAILED_PUSH_NOTIF_DISABLE_ENDPOINT: -303,

	// neo4j error mapping
	NEO4J_GET_ENDPOINT_FAILED: -900,
	NEO4J_CONNECTION_STATUS_UPDATE_FAILED: -901,
	NEO4J_CREATE_RELATION_FAILED: -902,
	NEO4J_CREATE_ENDPOINT_FAILED: -903,
	NEO4J_ENDPOINT_NOT_EXIST: -904,

};
exports.ERROR_TYPES = ERROR_TYPES;
const SNS_ERROR_TYPES = {
	EndpointDisabled: "EndpointDisabled"
};
exports.SNS_ERROR_TYPES = SNS_ERROR_TYPES;
const NUMERIC_CONSTANTS = {
	ZERO_INTEGER: 0,
};
exports.NUMERIC_CONSTANTS = NUMERIC_CONSTANTS;
const SUCCESS_TYPES = {
	SUCCESS: 1
};
exports.SUCCESS_TYPES = SUCCESS_TYPES;
const NOTIFICATION_TYPES = {
	NOTIFIED_PENDING_FRIEND_REQUEST: "NOTIFIED_PENDING_FRIEND_REQUEST",
	NOTIFIED_FOLLOWS: "NOTIFIED_FOLLOWS",
	NOTIFIED_GROUP_CREATED: "NOTIFIED_GROUP_CREATED",
	NOTIFIED_ADDED_TO_GROUP: "NOTIFIED_ADDED_TO_GROUP"
};
exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;

const RELATION_TYPES = {
	CONNECTED: "CONNECTED"
};
exports.RELATION_TYPES = RELATION_TYPES;

const CONNECTION_STATUS = {
	loggedin : "loggedin",
	loggedout : "loggedout"
}
exports.CONNECTION_STATUS = CONNECTION_STATUS;

const OPERATION_TYPES = { 
	createNotifiedConnection : "createNotifiedConnection",
	getEndpointList : "getEndpointList",
	disableEndpoint : "disableEndpoint"
}
exports.OPERATION_TYPES = OPERATION_TYPES;
