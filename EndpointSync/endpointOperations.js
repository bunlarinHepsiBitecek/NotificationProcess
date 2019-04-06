'use strict';

const HTTP_METHOD = {

	GET     : "GET",
	POST    : "POST",
	PUT     : "PUT",
	DELETE  : "DELETE",
	ANY     : "ANY"

};  

const PROCESS_REQUEST_TYPE = {

	loggedin : "loggedin",
	loggedout : "loggedout"

};

const CONNECTION_STATUS = {
	loggedin : "loggedin",
	loggedout : "loggedout"
}

const PLATFORM_TYPES = {
	IOS : "ios",
	ANDROID : "android"
}

const ERROR_TYPES = { 

	INVALID_HTTP_METHOD : -100,
	INVALID_REQUEST_TYPE : -101,
	INVALID_USERID : -102,
	INVALID_DEVICE_TOKEN : -103,
	INVALID_PLATFORM_TYPE : -104,
	INVALID_EVENT_BODY : -105,
	INVALID_PATH : -106,

	NEO4J_GET_ENDPOINT_FAILED : -900,
	NEO4J_CONNECTION_STATUS_UPDATE_FAILED : -901,
	NEO4J_CREATE_RELATION_FAILED : -902,
	NEO4J_CREATE_ENDPOINT_FAILED : -903,

	SNS_CREATE_ENDPOINT_FAILED : -800

};

const NUMERIC_CONSTANTS = { 

	ZERO_INTEGER : 0, 

};

const SUCCESS_TYPES = { 

	SUCCESS : 1

};

// drivers
const aws_sdk = require('aws-sdk');
const neo4j = require('neo4j-driver').v1;

// neo4j connection configurations
let uri = process.env.NEO4J_URL;
let user = process.env.NEO4J_USER;
let password = process.env.NEO4J_PASSWORD;

// sns platform applications arn informations
let ios_sns_arn = process.env.SNS_IOS_PLATFORM_APPLICATION_ARN;
let android_sns_arn = process.env.SNS_ANDROID_PLATFORM_APPLICATION_ARN;

// neo4j driver and session
const neo4jDriver = neo4j.driver(uri, neo4j.auth.basic(user, password));
const neo4jSession = neo4jDriver.session();

let response = {};

function initializeReponseVariables() {

	var responseCode = 200;
	var responseBody = {
		error: {
			code: 1,
			message: ""
		}
	};

	console.log("responseBody : ", responseBody);
	console.log("responseCode : ", responseCode);
	
	return { responseBody, responseCode };
}

// MAIN MODULE
module.exports.handler = function (event, context, callback) {
	console.log("event : ", event);

	let inputValidationResult = inputValidation(event);
	console.log("inputValidationResult : ", inputValidationResult);
	if (inputValidationResult !== SUCCESS_TYPES.SUCCESS) {
		return finalizeFunction(inputValidationResult, null, callback);
	}
	// create body object
	let body = JSON.parse(event.body);

	// user loggedin or loggedout
	switch (body.requestType) {
		// loggedin
		case PROCESS_REQUEST_TYPE.loggedin:
			startLoggedinProcess(body, callback);
			break;

		// loggedout
		case PROCESS_REQUEST_TYPE.loggedout:
			startLoggedoutProcess(body, callback);
			break;

		default:
			inputValidationResult = ERROR_TYPES.INVALID_REQUEST_TYPE;
			finalizeFunction(inputValidationResult, null, callback);
			break;
	};

};

async function startLoggedinProcess(body, callback) {
	console.log("startLoggedinProcess2 starts");

	const endpointTransaction = neo4jSession.beginTransaction();

	// endpointRetrievedDataResult is consisted of result data and response code as a json, from this point on following functions needs just data
	const endpointRetrievedDataResult = await getEndpointDataFromNeo4j(body, endpointTransaction);
	console.log("endpointRetrievedDataResult : ", endpointRetrievedDataResult);

	if (endpointRetrievedDataResult.responseCode !== SUCCESS_TYPES.SUCCESS) {
		console.log("transaction is failed");
		terminateServiceWithSessions(endpointRetrievedDataResult.responseCode, null, endpointTransaction, callback);
	} else {
		// endpointRetrievedDataResult is used to decide program flow
		// * connection status update
		// * create new relation between loggedin user and endpoint node
		// * create an endpoint 
		endpointOperations(body, endpointRetrievedDataResult.responseData, endpointTransaction, callback);

 		// for unit test uncomment statements below
		//console.log("transaction is succesfull");
		//terminateServiceWithSessions(endpointResult3.responseCode, null, endpointTransaction, callback);
	}

};

function startLoggedoutProcess(body, callback) {
	console.log("startLoggedoutProcess starts");

	const endpointTransaction = neo4jSession.beginTransaction();

	let query = `match(e:Endpoint {deviceToken:$deviceTokenValue})<-[connection:CONNECTED]-(u:User {userid:$useridValue}) set connection.status = $loggedinValue`;
	let parameter = { deviceTokenValue: body.deviceToken, useridValue: body.userid, loggedinValue: CONNECTION_STATUS.loggedout };

	endpointTransaction.run(query, parameter).then(result => {
		console.log("RESULT startLoggedoutProcess: ", result);
		terminateServiceWithSessions(SUCCESS_TYPES.SUCCESS, null, endpointTransaction, callback);
	})
	.catch(error => {
		console.log("ERROR startLoggedoutProcess: ", error);
		terminateServiceWithSessions(ERROR_TYPES.NEO4J_CONNECTION_STATUS_UPDATE_FAILED, null, endpointTransaction, callback);
	});

}

/**
 * 
 * @param {*} body data is used to get userid, deviceToken and so on for necessary developments
 * @param {*} endpointTransaction transaction registered to current neo4j session
 * @param {*} callback main callback reference coming from handler itself
 * 
 * function return a json object contains responseData and responseCode
 */
async function getEndpointDataFromNeo4j(body, endpointTransaction) {
	console.log("getEndpointDataFromNeo4j starts");

	var queryResult = {
		responseData: {},
		responseCode: 1
	};

	console.log("queryResult : ", queryResult);

	// query and parameter definitions
	let query = `match(endpoint:Endpoint {deviceToken:$deviceTokenValue})<-[connection:CONNECTED]-(user:User) return endpoint,user,connection`;
	let parameter = { deviceTokenValue: body.deviceToken };
	
	// async neo4j transaction call 
	const getEndpointDataFromNeo4jResult = await endpointTransaction.run(query, parameter).then(result => {
		console.log("RESULT endpointQueryResult3 : ", result);
		// at this point, if you do not return something, getEndpointDataFromNeo4jResult would be undefined
		queryResult.responseData = result;
		return queryResult;
		
		// #1 - error handling unit test statements, uncomment the statement below and comment statement "return result" above
		//throw ERROR_TYPES.NEO4J_GET_ENDPOINT_FAILED;
	})
	.catch(error => {
		console.log("ERROR getEndpointDataFromNeo4j failed: ", error);
		queryResult.responseCode = error;
		return queryResult;
	});
 
	// the statement below return whole function response
	console.log("getEndpointDataFromNeo4jResult : ", getEndpointDataFromNeo4jResult);
	return getEndpointDataFromNeo4jResult;

};

/**
 * 
 * @param {*} body data is used to get userid, deviceToken and so on for necessary developments
 * @param {*} endpointQueryResult data retrived from neo4j by using deviceToken. One endpoint and a number of user connected to it
 * @param {*} endpointTransaction transaction registered to current neo4j session
 * @param {*} callback main callback reference coming from handler itself
 * 
 * The function below runs for one of the following operations;
 * 		- Update loggedin user's connection status on endpoint edge
 * 		- Create relation between user and endpoint
 * 		- Create an endpoint in SNS, then create an endpoint node and it's relation in neo4j 
 */
function endpointOperations(body, endpointQueryResult, endpointTransaction, callback) {
	console.log("endpointOperations starts");
	console.log("endpointQueryResult : ", endpointQueryResult);
	console.log("endpointTransaction : ", endpointTransaction);

	var flagContainer = {
		connectionStatusLoggedoutFound: false,
		userEndpointConnectionRequired: false,
		endpointCreationRequired: false
	};
	console.log("flagContainer : ", flagContainer);
	setFlagContainerData(endpointQueryResult, body, flagContainer);
	console.log("flagContainer : ", flagContainer);

	if (flagContainer.connectionStatusLoggedoutFound) {
		updateConnectionStatus(body, endpointTransaction, callback);
	} else if (flagContainer.userEndpointConnectionRequired) {
		createRelationBetweenLoggendInUserAndEndpoint(body, endpointTransaction, callback);
	} else if (flagContainer.endpointCreationRequired) {
		createEndpointProcess(body, endpointTransaction, callback);
	} else {
		console.log("Nothing to do");
		terminateServiceWithSessions(SUCCESS_TYPES.SUCCESS, null, endpointTransaction, callback);
	}

};

function setFlagContainerData(endpointQueryResult, body, flagContainer) {
	console.log("setFlagContainerData starts");
	console.log("endpointQueryResult.records.length : ", endpointQueryResult.records.length);

	if (endpointQueryResult.records.length > NUMERIC_CONSTANTS.ZERO_INTEGER) {
		endpointQueryResult.records.every(function (record) {
			if (record._fields[1].properties.userid.toString().trim() === body.userid) {
				// loggedin user has a connection to endpoint. In this circumstances there is no need to create another endpoint. But we need to check connection between user node and endpoint not status. If it's loggedin, there is no need for further operation. On the other hand, status is loggedout, it's required to update connection status as loggedin for push notificaton process.
				console.log("logged in userid has been found amoung node connections");
				let connectionStatus = record._fields[2].properties.status;
				if ((connectionStatus !== undefined && connectionStatus !== null) && (connectionStatus.toString().trim().toLowerCase() === CONNECTION_STATUS.loggedout)) {
					console.log("connectionStatus : ", connectionStatus);
					flagContainer.connectionStatusLoggedoutFound = true;
				}
				// at this point, we find loggedin userid, thus there is no need to continue in loop. Break the loop.
				return false;
			}
			else {
				// Thus there is no connection between loggedin user and endpoint, it's required to create a relation between them to publish push notifications
				console.log("logged in userid has not been found amoung node connections");
				flagContainer.userEndpointConnectionRequired = true;
			}
		});
	}
	else {
		//endpoint does not exist in neo4j. It means that there is no endpoint in SNS.
		flagContainer.endpointCreationRequired = true;
	}

	return flagContainer;
};

function updateConnectionStatus(body, endpointTransaction, callback) {
	console.log("updateConnectionStatus starts");
	// create neo4j query constants

	console.log("endpointTransaction : ", endpointTransaction);
	console.log("endpointTransaction.isOpen : ", endpointTransaction.isOpen);

	console.log("body.deviceToken : ", body.deviceToken);
	console.log("body.userid : ", body.userid);
	console.log("CONNECTION_STATUS.loggedin : ", CONNECTION_STATUS.loggedin);

	let query = `match(e:Endpoint {deviceToken:$deviceTokenValue})<-[connection:CONNECTED]-(u:User {userid:$useridValue}) set connection.status = $loggedinValue`;
	let parameter = { deviceTokenValue: body.deviceToken, useridValue: body.userid, loggedinValue: CONNECTION_STATUS.loggedin };

	endpointTransaction.run(query, parameter).then(result => {
		console.log("RESULT update connection status: ", result);
		terminateServiceWithSessions(SUCCESS_TYPES.SUCCESS, null, endpointTransaction, callback);
	})
	.catch(error => {
		console.log("ERROR update connection status failed: ", error);
		terminateServiceWithSessions(ERROR_TYPES.NEO4J_CONNECTION_STATUS_UPDATE_FAILED, null, endpointTransaction, callback);
	});
};

function createRelationBetweenLoggendInUserAndEndpoint(body, endpointTransaction, callback) {
	console.log("createRelationBetweenLoggendInUserAndEndpoint starts");
	console.log("endpointTransaction : ", endpointTransaction);
	console.log("endpointTransaction.isOpen : ", endpointTransaction.isOpen);

	let query = `match(endpoint:Endpoint {deviceToken:$deviceTokenValue}) match(user:User {userid:$useridValue}) create (user)-[connection:CONNECTED {status:$loggedinValue}]->(endpoint)`;
	let parameter = { deviceTokenValue: body.deviceToken, useridValue: body.userid, loggedinValue: CONNECTION_STATUS.loggedin };
	
	endpointTransaction.run(query, parameter).then(result => {
		console.log("RESULT createRelationBetweenLoggendInUserAndEndpoint _stats: ", result.summary);
		let resultSummary = result.summary;

		console.log("RESULT createRelationBetweenLoggendInUserAndEndpoint parameters: ", resultSummary);
		console.log("RESULT createRelationBetweenLoggendInUserAndEndpoint parameters: ", resultSummary.updateStatistics);
	})
	.then(() => {
		console.log("createRelationBetweenLoggendInUserAndEndpoint XXX");
		//closeConnectionsAndTransction();
		terminateServiceWithSessions(SUCCESS_TYPES.SUCCESS, null, endpointTransaction, callback);
	})
	.catch(error => {
		console.log("ERROR createRelationBetweenLoggendInUserAndEndpoint: ", error);
		terminateServiceWithSessions(ERROR_TYPES.NEO4J_CREATE_RELATION_FAILED, null, endpointTransaction, callback);
	});
};

function createEndpointProcess(body, endpointTransaction, callback) {
	console.log("createEndpointProcess starts");

	var sns = new aws_sdk.SNS();
		
	let deviceToken = body.deviceToken;

	// starts creating endpoint in sns push notification platforma applications
	var params = {
		PlatformApplicationArn: returnPlatformApplicationArnValue(body), /* required */
		Token: deviceToken /* required */
	};

	sns.createPlatformEndpoint(params, function(error, data) {
		if (error) {
			console.log("ERROR createSNSEndpoint2: ", error);
			terminateServiceWithSessions(ERROR_TYPES.SNS_CREATE_ENDPOINT_FAILED, null, endpointTransaction, callback);

		} else {
			console.log("data.EndpointArn : ", data.EndpointArn);
			createEndpointInNeo4jDatabase(body, data.EndpointArn, endpointTransaction, callback);
		}
	});

};

function returnPlatformApplicationArnValue(body) {
	let platformType = body.platformType;

	// decide in which platform endpoint is going to be created
	if (platformType.toString().trim().toLowerCase() === PLATFORM_TYPES.IOS) {
		return ios_sns_arn;
	} else if (platformType.toString().trim().toLowerCase() === PLATFORM_TYPES.ANDROID) {
		return android_sns_arn;
	} else {
		return;
	}
};

function createEndpointInNeo4jDatabase(body, arnData, endpointTransaction, callback) {
	console.log("createEndpointInNeo4jDatabase starts");
	console.log("arnData : ", arnData);
	
	let query = `match(user:User {userid:$useridValue}) create (user)-[connection:CONNECTED {status:$statusValue}]->(endpoint:Endpoint {arn:$arnValue, deviceToken:$deviceTokenValue, platformType:$platformTypeValue, isEnabled:$isEnabledValue})`;
	let parameter = { useridValue: body.userid, statusValue: CONNECTION_STATUS.loggedin, arnValue: arnData, deviceTokenValue: body.deviceToken, platformTypeValue: body.platformType, isEnabledValue: true};

	endpointTransaction.run(query, parameter).then(result => {
		console.log("RESULT createEndPointNodeInNeo4jDatabase2: ", result);
		terminateServiceWithSessions(SUCCESS_TYPES.SUCCESS, null, endpointTransaction, callback);
	})
	.catch(error => {
		console.log("ERROR createEndPointNodeInNeo4jDatabase2: ", error);
		terminateServiceWithSessions(ERROR_TYPES.NEO4J_CREATE_RELATION_FAILED, null, endpointTransaction, callback);
	});

};

/**
 * function invalidates input inside event, body and so on
 */
function inputValidation(event) {
	console.debug("inputValidation starts");

	if (event.httpMethod !== HTTP_METHOD.POST) {
		return ERROR_TYPES.INVALID_HTTP_METHOD;
	} 

	if (event.resource !== '/endpoint') {
		return ERROR_TYPES.INVALID_PATH;
	}

	if (event.body === undefined || event.body === '' || event.body === null) {
		return ERROR_TYPES.INVALID_EVENT_BODY;
	} else {
		let body = JSON.parse(event.body);

		// check request type valid
		if (body.requestType === undefined || body.requestType === '' || body.requestType === null) {
			return ERROR_TYPES.INVALID_REQUEST_TYPE;
		}

		// check userid valid
		if (body.userid === undefined || body.userid === '' || body.userid === null) {
			return ERROR_TYPES.INVALID_USERID;
		}

		// check deviceToken valid
		if (body.deviceToken === undefined || body.deviceToken === '' || body.deviceToken === null) {
			return ERROR_TYPES.INVALID_DEVICE_TOKEN;
		}

		// check platform type valid
		if (body.platformType === undefined || body.platformType === '' || body.platformType === null) {
			return ERROR_TYPES.INVALID_PLATFORM_TYPE;
		}
	}

	// if everything is fine, return success
	return SUCCESS_TYPES.SUCCESS;

};

 /**
  * 
  * @param {*} code return response code negative for error handling or positive value for successfull processes.
  * @param {*} jsonServerResult return server side data such as readed values or lists. If does not exist, set null.
  * @param {*} callback callback error, data
  */
function finalizeFunction(code, jsonServerResult, callback) {
	console.log("finalizeFunction starts");
	console.log("code : ", code);

	var { responseBody, responseCode } = initializeReponseVariables();
	console.log("responseBody : ", responseBody);
	console.log("responseCode : ", responseCode);

	// set server side result to json response such as read, list return values
	if (jsonServerResult !== null && jsonServerResult !== undefined) {
		responseBody.serverResult = jsonServerResult;
	}

	if (code !== SUCCESS_TYPES.SUCCESS) {
		// server error
		responseCode = 500
	}

	responseBody.error.code = code;

	console.log("responseBody : ", responseBody);
	console.log("responseCode : ", responseCode);

	response = buildOutput(responseCode, responseBody);
	return callback(null, response);
};

async function finalizeSessionObjects(errorCode, transaction) {
	if ((errorCode !== undefined && errorCode !== null) && (errorCode != SUCCESS_TYPES.SUCCESS)) {
		console.log("TRANSACTION ROLLBACK");
		await transaction.rollback();
	} else {
		console.log("TRANSACTION COMMITTED");
		await transaction.commit();
	}

	// neo4j session, driver closing
	neo4jSession.close();
	neo4jDriver.close()
};

function terminateServiceWithSessions(errorCode, responseData, endpointTransaction, callback) {
	finalizeSessionObjects(errorCode, endpointTransaction);
	finalizeFunction(errorCode, responseData, callback);
};

/* Utility function to build HTTP response for the microservices output */
function buildOutput(statusCode, data) {
	if (null != data) {
		data.error.message = getErrorMessage(data.error);
	}
	let response = {
		statusCode: statusCode,
		headers: {
			"Access-Control-Allow-Origin": "*"
		},
		body: JSON.stringify(data),
		isBase64Encoded: false
	};

	return response;
};

function getErrorMessage(error) {
	let message = "";
	switch(error.code) {
		case    1:
			message = "Success";
			break;
		case -100:
			message = "Invalid http method";
			break;
		case -101:
			message = "Invalid request type";
			break;
		case -102:
			message = "Invalid userid";
			break;
		case -103:
			message = "Invalid device token";
			break;
		case -104:
			message = "Invalid platform type";
			break;
		case -105:
			message = "Invalid body data";
			break;
		case -106:
			message = "Invalid path parameter";
			break;
		case -900:
			message = "Neo4j getting endpoint data failed";
			break;
		case -901:
			message = "Neo4j connection update process failed";
			break;
		case -902:
			message = "Neo4j relation create process failed";
			break;
		case -903:
			message = "Neo4j create endpoint process failed";
			break;
		case -800:
			message = "SNS create endpoint process failed";
			break;
		default:
			message = "Undefined error occured";
	}
	return message;
};

