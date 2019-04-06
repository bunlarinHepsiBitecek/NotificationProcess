/**
 * 
 * Batch Job to delete disabled endpoint from SNS and Neo4j
 * 		
 */

'use strict';

/** 
 * project enviroment variables
*/
const { uri, user, password } = require("./uri");

/**
 * constant variables
 */
const { SUCCESS_TYPES, NOTIFICATION_REQUEST_TYPE, NOTIFICATION_TYPES, SNS_ERROR_TYPES, NUMERIC_CONSTANTS, ERROR_TYPES, RELATION_TYPES, CONNECTION_STATUS, OPERATION_TYPES } = require("./constantFile");

// drivers
const aws_sdk = require('aws-sdk');
const neo4j = require('neo4j-driver').v1;

// neo4j driver and session
const neo4jDriver = neo4j.driver(uri, neo4j.auth.basic(user, password));
const neo4jSession = neo4jDriver.session();

// MAIN MODULE
module.exports.handler = function (event, context, callback) {
	console.log("endpoint deletion service invoked");
	console.log("event : ", event);
	console.log("context : ", context);
	console.log("callback : ", callback);

	mainProcess(callback);

};

async function mainProcess(callback) {
	
	try {
		const endpointsData = await getDisabledEndpointsFromNeo4j();	
		console.log("endpointsData : ", endpointsData);
		
		// need to await this function, because neo4j session must be open
		const deleteProcessResult = await deleteDisableEndpointsFromNeo4j();
		console.log("deleteProessResult : ", deleteProcessResult);

		// there is no need to await sns
		deleteProcessOfDisabledEndpointsFromSNS(endpointsData);

		// function and neo4j sessions and drivers can be closed at this point. Because it's not required to await sns to finish.
		closeSessionsAndFinalizeFunction(SUCCESS_TYPES.SUCCESS, callback);

	} catch (error) {
		console.log("ERROR startDeletingDisabledEndpointProcess : ", error);
		closeSessionsAndFinalizeFunction(error, callback);
	}

}


async function getDisabledEndpointsFromNeo4j() {
	console.log("getDisabledEndpointsFromNeo4j starts");
	
	let query = `match (endpoint:Endpoint {isEnabled:$isEnabledValue}) return endpoint`;
	let parameter = { isEnabledValue: false };

	return new Promise(function(resolve, reject) {
		
		neo4jSession.run(query, parameter).then(result => {
			console.log("resut :" , result);
			checkAndParseResultData(result, resolve, reject);
		})
		.catch(error => {
			console.log("error :" , error);
			reject(error);
		})

	});

	function checkAndParseResultData(result, resolve, reject) {
		if (result.records.length > NUMERIC_CONSTANTS.ZERO_INTEGER) {
			resolve(getParsedData(result));
		}
		else {
			reject(ERROR_TYPES.NEO4J_ENDPOINT_NOT_EXIST);
		}
	}
}

function getParsedData(neo4jResult) {
	console.log("getParsedData starts");

	var endpointArray = [];

	for (let index = 0; index < neo4jResult.records.length; index++) {
		const record = neo4jResult.records[index];

		if (record._fields[0].properties !== undefined && record._fields[0].properties !== null && record._fields[0].properties !== "") {
			if (record._fields[0].properties.arn !== undefined && record._fields[0].properties.arn !== null && record._fields[0].properties.arn !== "") {
				endpointArray.push(record._fields[0].properties.arn);
			}
		}
		
	}

	return endpointArray;

}

function deleteDisableEndpointsFromNeo4j() {
	
	return new Promise(function(resolve, reject) {

		let query = `match (endpoint:Endpoint {isEnabled:$isEnabledValue}) detach delete endpoint`;
		let parameter = { isEnabledValue: false };

		neo4jSession.run(query, parameter).then(result => {
			console.log("result : ", result);
			resolve(true);
		})
		.catch(error => {
			console.log("error : ", error);
			reject(false);
		})

	})

}

function deleteProcessOfDisabledEndpointsFromSNS(endpointArray) {
	console.log("deleteProcessOfDisabledEndpointsFromSNS starts");

	const sns = new aws_sdk.SNS();

	// there is no need for awating in here

	for (let index = 0; index < endpointArray.length; index++) {
		const endpoint = endpointArray[index];
		
		var params = {
			EndpointArn: endpoint
		};

		sns.deleteEndpoint(params, function(err, data) {

			if (err) {
				console.log("error : ", err);
			} else {
				console.log("data : ", data);
			}

		});

	}

}

/**
 * The function below finalize service and callback. In addition to this, close neo4j session and driver
 * 
 * @param {*} error error code 
 * @param {*} callback main callback reference
 */
function closeSessionsAndFinalizeFunction(error, callback) {
	console.log("closeSessionsAndFinalizeFunction starts");
	console.log("callback : ", callback);
	closeNeo4jSessionsAndDrivers();
	finalizeFunction(error, null, callback);
}

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

	let response = buildOutput(responseCode, responseBody);
	console.log("finale response : ", response);
	return callback(null, response);
};

/**
 * close neo4j session and driver
 */
function closeNeo4jSessionsAndDrivers() {
	neo4jSession.close();
	neo4jDriver.close()
}

/**
 * initialize response variables
 */
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

/**
 * function invalidates input inside event, body and so on
 */
function inputValidation(event) {
	console.debug("inputValidation starts");

	if (event.requestType === undefined || event.requestType === '' || event.requestType === null) {
		return ERROR_TYPES.INVALID_REQUEST_TYPE
	} else {
		if (event.requestType === NOTIFICATION_REQUEST_TYPE.create_group) {
			if (event.additionalData === undefined || event.additionalData === '' || event.additionalData === null) {
				return ERROR_TYPES.INVALID_ADDITIONAL_DATA
			}
		}
	}
	if (event.fromWhom === undefined || event.fromWhom === '' || event.fromWhom === null) {
		return ERROR_TYPES.INVALID_USERID
	}
	if (event.toWhoms === undefined || event.toWhoms === '' || event.toWhoms === null) {
		return ERROR_TYPES.INVALID_USERID
	}
	if (event.toWhoms.length <= NUMERIC_CONSTANTS.ZERO_INTEGER) {
		return ERROR_TYPES.INVALID_RECEIVER_COUNT
	}
	// if everything is fine, return success
	return SUCCESS_TYPES.SUCCESS;

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
	switch (error.code) {
		case 1:
			message = "Success";
			break;
		case -100:
			message = "Invalid http method";
			break;
		case -101:
			message = "Invalid request type";
			break;
		case -102:
			message = "Invalid or missing userid values";
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
		case -107:
			message = "Invalid or missing requester name information";
			break;
		case -108:
			message = "Invalid notification receiver count";
			break;
		case -109:
			message = "Additional data is missing, it's required for group creation process";
			break;
		case -200:
			message = "Missing group infomation";
			break;
		case -201:
			message = "Missing group participants, push notifications is not required";
			break;
		case -202:
			message = "Missing group creator informations";
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
		case -904:
			message = "There is no disabled endpoint to be deleted";
			break;
		default:
			message = "Undefined error occured";
	}
	return message;
};

