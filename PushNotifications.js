/**
 * 
 * Push Notification Servise
 * 
 * Requiered Parameters:
 * 
 * 		* @param {} requestType			{ contains caller function requestType informations. It could be one of following types }
 * 		* @param {} fromWhom			{ user who triggers push notification service. Contains userid value }
 * 		* @param {} toWhoms 			{ user(s) who gets push notification. Contains userid value(s). }
 * 		
 * Additional Parameters
 * 		
 * 		* @param {} additionalData		{ structure must be contain at least following attributes. Sample 
 * 									
 *	 									additionalData : {
										// if additionalData passed, parameterCounts and variableNames are required
											variableNames : ["fromWhomUsername", "fromWhomName"],
											fromWhomUsername : data.updatedUserRelationInfo.username,
											fromWhomName : data.updatedUserRelationInfo.name
										} 
									}
 * 		
 */

'use strict';

/** 
 * project enviroment variables
*/
const { uri, user, password, followRequestLocKey, directFollowRequestLocKey, groupCreateLocKey } = require("./uri");

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
	console.log("PushNotifications service invoked");
	console.log("event : ", event);

	
	let inputValidationResult = inputValidation(event);
	console.log("inputValidationResult : ", inputValidationResult);
	if (inputValidationResult !== SUCCESS_TYPES.SUCCESS) {
		return finalizeFunction(inputValidationResult, null, callback);
	}

	startPushNotificationBusiness(event, callback);

};

/** 
 * Function requires original body information
 * 
 * @param {} data get complete service input data
 */
function returnRequesType(data) {
	return data.requestType;
}

/**
 * The function belows starts push notification business.
 * 
 * @param {*} data complete service input data
 * @param {*} callback main callback reference
 */
async function startPushNotificationBusiness(data, callback) {
	console.log("startPushNotificationBusiness starts");
	
	try {
		//getting endpoint(s) of toWhom(s)
		const endpointDataList = await getUserNotifiedInfoAndActiveEndpoints(data);
		console.log("endpointDataList : ", endpointDataList);

		if (checkEndPointDataList(endpointDataList)) {
			startSendingPushNotificationProcess(endpointDataList, data, callback);
		} else {
			throw ERROR_TYPES.NEO4J_GET_ENDPOINT_FAILED;
		}

	} catch (error) {
		console.log("something goes wrong while getting endpoint data from neo4j");
		closeSessionsAndFinalizeFunction(error, callback);
	}

	// check if endpointDataList has value inside or not
	function checkEndPointDataList(endpointDataList) {
		return endpointDataList.length > NUMERIC_CONSTANTS.ZERO_INTEGER;
	}
};

/**
 *
 * The function below retrieves all endpoint input toWhoms from neo4j 
 * 
 * @param {*} serviceInput main service inputs
 */
async function getUserNotifiedInfoAndActiveEndpoints(serviceInput) {
	console.log("getUserNotifiedInfoAndActiveEndpoints starts");
	console.log("serviceInput : ", serviceInput);

	// it will contain all endpoints related toWhoms arrays. It contains endpoint data retrieved from neo4j nodes and user informations.
	// (User information could be duplicated, do not worry abou it.)
	var totalEndpointData = [];

	await Promise.all(serviceInput.toWhoms.map(async function(toWhom) {
		console.log("toWhom : ", toWhom);

		try {
			const endpointResult = await getEndpointsForItem(toWhom, serviceInput);
			// merge arrays
			console.log("endpointResult : ", endpointResult);
			totalEndpointData = totalEndpointData.concat(endpointResult);
			
		} catch (error) {
			console.log("error getUserNotifiedInfoAndActiveEndpoints : ", error);		
		}
		
	}))
	
	console.log("totalEndpointData : ", totalEndpointData);
	return totalEndpointData;
	
}

/**
 * 
 * The function below is responsible for sending push notifications for each every one of endpoint in endpointDataList array. Besides, if endpoints disabled in sns
 * are going to be disabled in neo4j as weel. After push notification process finishes, function starts to create notified connections between nodes in neo4j
 * in order not to publish the same notification multiple times to same users. 
 * 
 * @param {*} endpointDataList all retrieved endpoints from neo4j with user informations such as user notified before, userid etc
 * @param {*} data main service inputs holding request type, fromWhom etc for returning parametric values according to requestType
 * @param {*} callback main callback reference
 */
async function startSendingPushNotificationProcess(endpointDataList, data, callback) {
	console.log("startSendingPushNotificationProcess starts");
	console.log("endpointDataList : ", endpointDataList);

	// create SNS driver for publishing push notification 
	const sns = new aws_sdk.SNS();
	
	// it holds successfull notified users
	var markedUsersArray = []

	// endpoint - push notif and disable endpoint steps
	await Promise.all(endpointDataList.map(async function(endpointData) {
		console.log("endpointData : ", endpointData);

		if (checkIfUserInformedBefore(endpointData)) {
			
			try {
				const resultPushNotification = await publishPushNotification(sns, endpointData, data);
				console.log("RESULT resultPushNotification : ", resultPushNotification);
	
				markedUsersArray.push(endpointData.endpointUserRelatedData.endpointOwner);
	
			} catch (error) {
				
				console.log("ERROR startSendingPushNotificationProcess : ", error);
				try {
					const resultDisableEndPointInNeo4j = await disableEndpoint(endpointData);
					console.log("RESULT resultDisableEndPointInNeo4j : ", resultDisableEndPointInNeo4j);
				} catch (error) {
					console.log("ERROR resultDisableEndPointInNeo4j : ", error);
				}
	
			}
			
		} 

	}))

	// relation creation in neo4j step
	await startCreationNotifiedConnections(markedUsersArray, data);

	console.log("startSendingPushNotificationProcess is ok");

	// everyting is fine, time to close session and driver successfully
	closeSessionsAndFinalizeFunction(SUCCESS_TYPES.SUCCESS, callback);

	// return user is informed before information
	function checkIfUserInformedBefore(endpointData) {
		console.log("endpointData.endpointUserRelatedData.isUserNotifiedBefore  :", endpointData.endpointUserRelatedData.isUserNotifiedBefore);
		return !endpointData.endpointUserRelatedData.isUserNotifiedBefore;
	}
}

/**
 * 
 * The function below starts to create notified connection between nodes in neo4j
 * 
 * @param {*} markedUsersArray it contains userid values succesfully sended push notifications
 * @param {*} data main service inputs 
 */
async function startCreationNotifiedConnections(markedUsersArray, data) {
	let uniqueUserList = [...new Set(markedUsersArray)];
	
	await Promise.all(uniqueUserList.map(async function (toWhom) {
		try {
			await createUserNotifiedConnection(toWhom, data);
		}
		catch (error) {
			console.log("ERROR createUserNotifiedConnection : ", error);
		}
	}));
}

/**
 * 
 * The function return endpoint node from neo4j
 * 
 * @param {*} toWhom user to be informed
 * @param {*} data main service input data
 */
function getEndpointsForItem(toWhom, data) {

	return new Promise(function(resolve, reject) {

		var { query, parameter } = returnNeo4jQueryAndParams(createRequiredInputData(), data);
		
		console.log("query : ", query);
		console.log("parameter : ", parameter);
		
		neo4jSession.run(query, parameter).then(result => {
			console.log("RESULT promiseResultEndpoints : ", result);
			resolve(getParsedData(toWhom, result, data));
			//resolve(result);
		})
		.catch(error => {
			console.log("ERROR promiseResultEndpoints : ", error);
			reject(ERROR_TYPES.FAILED_GETTING_ENDPOINTS);
		});

	})

	// create required inputs to get necessary query and parameters
	function createRequiredInputData() {
		return {
			fromWhom: data.fromWhom,
			toWhom: toWhom,
			operationType: OPERATION_TYPES.getEndpointList,
		};
	}
}

/**
 * 
 * The function below parses the data coming from neo4j and prepare it for further uses in service
 * 
 * @param {*} toWhom userid is to be informed
 * @param {*} endpointResultData endpoint neo4j resul data to be parsed
 * @param {*} additionalDataExists if aditional data exist or not
 */
function getParsedData(toWhom, endpointResultData, data) {
	console.log("getParsedData starts");
	console.log("toWhom : ", toWhom);
	console.log("endpointResultData : ", endpointResultData);

	var endpointsAndInputData = [];
	var isUserNotifiedBefore = false;

	/** 
	 * _fields[0]	: is user notified before ? { true or false }
	 * _fields[1]	: endpoint data connected with user 
	 * _fields[2]	: this data holds additional information if it exists
	 */ 

	console.log("endpointResultData.records.length : ", endpointResultData.records.length);
	
	// if there is a data coming from neo4j, run the process. Otherwise, do not proceede
	if (checkEndpointResultDataLength()) {
		
		isUserNotifiedBefore = endpointResultData.records[0]._fields[0];
	
		endpointResultData.records[0]._fields[1].forEach(function(item) {
			console.log("item : ", item.properties);
	
			var temp = {
				properties : item.properties,
				endpointUserRelatedData : {
					endpointOwner : toWhom,
					isUserNotifiedBefore : isUserNotifiedBefore
				}
			};
	
			// if additional data does not exists in input, it can be retrieved from neo4j retuls

			switch (returnRequesType(data)) {
				case NOTIFICATION_REQUEST_TYPE.followRequest:
				case NOTIFICATION_REQUEST_TYPE.createFollowDirectly:
					if (!parseAdditionalData(data).additionalDataExists) {
						if (endpointResultData.records[0]._fields[2] !== undefined && endpointResultData.records[0]._fields[2] !== null) {
							console.log("additional data does not exist input, so we retrieved it from neo4j")
							temp.endpointUserRelatedData.additionalData = endpointResultData.records[0]._fields[2];
						}
					}
					break;
			
				default:
					break;
			}

			//pushNotifData.endpointsAndInputData.push(temp);
			endpointsAndInputData.push(temp);
	
		})
	
		console.log("endpointsAndInputData : ", endpointsAndInputData);
		return endpointsAndInputData;
	
	}

	// check endpoint result data length
	function checkEndpointResultDataLength() {
		return endpointResultData.records.length > NUMERIC_CONSTANTS.ZERO_INTEGER;
	}
}

/**
 * 
 * The function below return query and parameter according to request type or/and operation type
 * 
 * @param {*} input json data contains several parameters
 */
function returnNeo4jQueryAndParams(input, data) {
	console.log("returnNeo4jQueryAndParams starts");
	console.log("fromWhom :", input.fromWhom);
	console.log("toWhom :", input.toWhom);
	console.log("operationType :", input.operationType);
	console.log("endpoint :", input.endpoint);
	
	const fromWhom = input.fromWhom;
	const toWhom = input.toWhom;
	const operationType = input.operationType;
	const endpointData = input.endpointData;
	
	const requestType = data.requestType;
	console.log("requestType :", input.requestType);
	//const groupid = ""; TypeError: Assignment to constant variable.
	
	// retrieve necessary data from additionData input
	var groupid = "";
	const additionalDataResponse = parseAdditionalData(data);

	switch (returnRequesType(data)) {
		case NOTIFICATION_REQUEST_TYPE.followRequest:
		case NOTIFICATION_REQUEST_TYPE.createFollowDirectly: 
			break;

		case NOTIFICATION_REQUEST_TYPE.create_group:
		case NOTIFICATION_REQUEST_TYPE.add_participant_into_group:
			groupid = additionalDataResponse.parsedAdditionalData[2];
			break;
	
		default:
			break;
	}

	/**
	 * query and parameter variables
	*/
	let query = ``;
	let parameter = {};

	switch (operationType) {
		case OPERATION_TYPES.getEndpointList:
			console.log("1");
			// additional data exists
			if (additionalDataResponse.additionalDataExists) {
				console.log("2");
				switch (requestType) {
					case NOTIFICATION_REQUEST_TYPE.followRequest:
						console.log("3");
						query = `match (requestedUser:User {userid:$toWhomValue})-[connection:${RELATION_TYPES.CONNECTED} {status:$statusVaule}]->(endpoint:Endpoint {isEnabled:$isEnabledValue}) with endpoint return exists((:User {userid:$toWhomValue})<-[:${NOTIFICATION_TYPES.NOTIFIED_PENDING_FRIEND_REQUEST}]-(:User {userid:$fromWhomValue})), collect(endpoint)`;
						parameter = { toWhomValue: toWhom, fromWhomValue: fromWhom, statusVaule: CONNECTION_STATUS.loggedin, isEnabledValue: true };
						break;
						
					case NOTIFICATION_REQUEST_TYPE.createFollowDirectly:
						console.log("4");
						query = `match (requestedUser:User {userid:$toWhomValue})-[connection:${RELATION_TYPES.CONNECTED} {status:$statusVaule}]->(endpoint:Endpoint {isEnabled:$isEnabledValue}) with endpoint return exists((:User {userid:$toWhomValue})<-[:${NOTIFICATION_TYPES.NOTIFIED_FOLLOWS}]-(:User {userid:$fromWhomValue})), collect(endpoint)`
						parameter = { toWhomValue: toWhom, fromWhomValue: fromWhom, statusVaule: CONNECTION_STATUS.loggedin, isEnabledValue: true };
						break;
	
					case NOTIFICATION_REQUEST_TYPE.create_group:
						console.log("5");
						query = `match (participant:User {userid:$participantUseridValue})-[connection:${RELATION_TYPES.CONNECTED} {status:$statusValue}]->(endpoint:Endpoint {isEnabled:$isEnabledValue}) with endpoint return exists((:Group {groupid:$groupidValue})-[:${NOTIFICATION_TYPES.NOTIFIED_GROUP_CREATED}]->(:User {userid:$participantUseridValue})), collect(endpoint)`
						parameter = { participantUseridValue: toWhom, groupidValue: groupid, statusValue: CONNECTION_STATUS.loggedin, isEnabledValue: true };
						break;

					case NOTIFICATION_REQUEST_TYPE.add_participant_into_group:
						console.log("18");
						query = `match (participant:User {userid:$participantUseridValue})-[connection:${RELATION_TYPES.CONNECTED} {status:$statusValue}]->(endpoint:Endpoint {isEnabled:$isEnabledValue}) with endpoint return exists((:Group {groupid:$groupidValue})-[:${NOTIFICATION_TYPES.NOTIFIED_GROUP_CREATED}|${NOTIFICATION_TYPES.NOTIFIED_ADDED_TO_GROUP}]->(:User {userid:$participantUseridValue})), collect(endpoint)`
						parameter = { participantUseridValue: toWhom, groupidValue: groupid, statusValue: CONNECTION_STATUS.loggedin, isEnabledValue: true };
						break;
	
					default:
						console.log("6");
						break;
				}
			} else {
				console.log("7");
				// additional data does not exist
				switch (requestType) {
					case NOTIFICATION_REQUEST_TYPE.followRequest:
						console.log("8");
						query = `match (requestedUser:User {userid:$toWhomValue})-[connection:${RELATION_TYPES.CONNECTED} {status:$statusVaule}]->(endpoint:Endpoint {isEnabled:$isEnabledValue}) with endpoint match(requesterUser:User {userid:$fromWhomValue}) with requesterUser, endpoint return exists((:User {userid:$toWhomValue})<-[:${NOTIFICATION_TYPES.NOTIFIED_PENDING_FRIEND_REQUEST}]-(:User {userid:$fromWhomValue})), collect(endpoint), requesterUser{.username, .name}`;
						parameter = { toWhomValue: toWhom, fromWhomValue: fromWhom, statusVaule: CONNECTION_STATUS.loggedin, isEnabledValue: true };
						break;
						
					case NOTIFICATION_REQUEST_TYPE.createFollowDirectly:
						console.log("9");
						query = `match (requestedUser:User {userid:$toWhomValue})-[connection:${RELATION_TYPES.CONNECTED} {status:$statusVaule}]->(endpoint:Endpoint {isEnabled:$isEnabledValue}) with endpoint match(requesterUser:User {userid:$fromWhomValue}) with requesterUser, endpoint return exists((:User {userid:$toWhomValue})<-[:${NOTIFICATION_TYPES.NOTIFIED_FOLLOWS}]-(:User {userid:$fromWhomValue})), collect(endpoint), requesterUser{.username, .name}`
						parameter = { toWhomValue: toWhom, fromWhomValue: fromWhom, statusVaule: CONNECTION_STATUS.loggedin, isEnabledValue: true };
						break;
	
					// case NOTIFICATION_REQUEST_TYPE.create_group:
					// 	console.log("10");
					// 	query = `match (participant:User {userid:$participantUseridValue})-[connection:${RELATION_TYPES.CONNECTED} {status:$statusValue}]->(endpoint:Endpoint {isEnabled:$isEnabledValue}) with endpoint return exists((:Group {groupid:$groupidValue})-[:${NOTIFICATION_TYPES.NOTIFIED_GROUP_CREATED}]->(:User {userid:$participantUseridValue})), collect(endpoint)`
					// 	parameter = { participantUseridValue: data.currentParticipant.participantUserid, groupidValue: data.createdGroupInfo.groupid, statusValue: CONNECTION_STATUS.loggedin, isEnabledValue: true };
					// 	break;
	
					default:
						console.log("11");
						break;
				}
			}

			break;

		case OPERATION_TYPES.createNotifiedConnection:
			console.log("12");
			switch (requestType) {
				case NOTIFICATION_REQUEST_TYPE.followRequest:
					console.log("13");
					query = `match (requestedUser:User {userid:$toWhomValue}) match (requesterUser:User {userid:$fromWhomValue}) create (requesterUser)-[:${NOTIFICATION_TYPES.NOTIFIED_PENDING_FRIEND_REQUEST}]->(requestedUser)`
					parameter = { toWhomValue: toWhom, fromWhomValue: fromWhom };
					break;
					
				case NOTIFICATION_REQUEST_TYPE.createFollowDirectly:
					console.log("14");
					query = `match (requestedUser:User {userid:$toWhomValue}) match (requesterUser:User {userid:$fromWhomValue}) create (requesterUser)-[:${NOTIFICATION_TYPES.NOTIFIED_FOLLOWS}]->(requestedUser)`
					parameter = { toWhomValue: toWhom, fromWhomValue: fromWhom };
					break;
				
				case NOTIFICATION_REQUEST_TYPE.create_group:
					console.log("15");
					query = `match (participant:User {userid:$participantUseridValue}) match (group:Group {groupid:$groupidValue}) create (group)-[:${NOTIFICATION_TYPES.NOTIFIED_GROUP_CREATED}]->(participant)`
					parameter = { participantUseridValue: toWhom, groupidValue: groupid };
					break;
				
				case NOTIFICATION_REQUEST_TYPE.add_participant_into_group:
					console.log("17");
					query = `match (participant:User {userid:$participantUseridValue}) match (group:Group {groupid:$groupidValue}) create (group)-[:${NOTIFICATION_TYPES.NOTIFIED_ADDED_TO_GROUP}]->(participant)`
					parameter = { participantUseridValue: toWhom, groupidValue: groupid };
					break;
					
				default:
					console.log("16");
					break;
			}
				
			break;
		
		case OPERATION_TYPES.disableEndpoint:
			console.log("16");
			query = `match (endpoint:Endpoint {arn:$arnValue}) set endpoint.isEnabled = $isEnabledValue`
			parameter = { arnValue: endpointData.properties.arn, isEnabledValue: false };
			break;
		default:
			break;
	}

	console.log("query : ", query);
	console.log("parameter : ", parameter);

	return { query, parameter };

}

/**
 * The function below finalize service and callback. In addition to this, close neo4j session and driver
 * 
 * @param {*} error error code 
 * @param {*} callback main callback reference
 */
function closeSessionsAndFinalizeFunction(error, callback) {
	closeNeo4jSessionsAndDrivers();
	finalizeFunction(error, null, callback);
}

/**
 * 
 * @param {*} data sercive input data
 */
function parseAdditionalData(data) {
	
	var response = {
		additionalDataExists : false,
		parsedAdditionalData : []
	}

	if (data.additionalData !== undefined && data.additionalData !== null) {
		console.log("data.aditionalData : ", data.additionalData);

		if (data.additionalData.variableNames !== undefined && data.additionalData.variableNames !== null) {
			
			const variableNamesArray = data.additionalData.variableNames;
	
			if (Array.isArray(variableNamesArray)) {
				if (variableNamesArray.length > NUMERIC_CONSTANTS.ZERO_INTEGER) {
	
					response.additionalDataExists = true
			
					for (let index = 0; index < variableNamesArray.length; index++) {
						const variableName = variableNamesArray[index];
						console.log("variableName : ", variableName);
						response.parsedAdditionalData.push(data.additionalData[variableName])
					}
					
				}

			}

		}

	}
	console.log("response : ", response);
	return response

}

/**
 * 
 * The function below triggers a push notification for input endpoint value.
 * 
 * @param {*} snsDriver sns object to connect with simple notification service of amazon aws
 * @param {*} endpoint application endpoint to publish push notification
 * @param {*} data contains body, user endpoints and information about whether user is notified before or not
 */
function publishPushNotification(snsDriver, endpointData, data) { 
	console.log("publishPushNotification starts");
	console.log("endpointData : ", endpointData);
	console.log("data : ", data);

	return new Promise(function(resolve, reject) { 

		// response to inform caller function
		var response = { 
			responseData: {}, 
			responseCode: SUCCESS_TYPES.SUCCESS
		}

		var payload = {
			APNS_SANDBOX: {
				aps: {
					alert: {
						"loc-key": returnLocKeyData(data),
						"loc-args": returnLocArgData(data)
					},
					sound: 'default',
					badge: 1
				}
			}
		};
	
		// first have to stringify the inner APNS object...
		payload.APNS_SANDBOX = JSON.stringify(payload.APNS_SANDBOX);
		// then have to stringify the entire message payload
		payload = JSON.stringify(payload);
	
		var params = {
			//Message: JSON.stringify(message),
			Message: payload,
			MessageStructure: 'json',
			Subject: 'CatchU',
			TargetArn: endpointData.properties.arn
		};

		snsDriver.publish(params, function(error, data) {
			if (error) {
				if (error.code === SNS_ERROR_TYPES.EndpointDisabled) {
					// delete from SNS, delete from neo4j async
					// deleteEndpointFromSNSandNeo4j(endpoint, sns);
					console.log("error.code : ", error.code);
					response.responseData = endpointData;
					response.responseCode = ERROR_TYPES.FAILED_PUSH_NOTIF_DISABLE_ENDPOINT;
					reject(response);
				}

 			} else { 
				/**
				 * A succesful notif is enough for us. Let's create a connection between requester and requested user about 
				 * notification is send. In order not to send notification again, not to disturb mobile app end users 
				 */
				console.log("SNS publishPushNotification data : ", data);
				resolve(response);
			}
		})
	})

}

/**
 * 
 * The function below returns the loc-key data for push notifications
 * 
 * @param {*} data contains required inputs from body
 */
function returnLocKeyData(data) {
	
	switch (returnRequesType(data)) {
		case NOTIFICATION_REQUEST_TYPE.followRequest:
			return followRequestLocKey
		case NOTIFICATION_REQUEST_TYPE.createFollowDirectly:
			return directFollowRequestLocKey
		case NOTIFICATION_REQUEST_TYPE.create_group:
		case NOTIFICATION_REQUEST_TYPE.add_participant_into_group:
			return groupCreateLocKey
		default:
			break;
	}

}

/**
 * 
 * The function below returns the loc-args data for push notifications
 * 
 * @param {*} body contains required inputs from body
 */
function returnLocArgData(data) {
	
	const additionalDataResponse = parseAdditionalData(data);
	console.log("additionalDataResponse : ", additionalDataResponse);

	switch (returnRequesType(data)) {
		case NOTIFICATION_REQUEST_TYPE.followRequest:
		case NOTIFICATION_REQUEST_TYPE.createFollowDirectly:
			return [returnSenderInfo(data)];
		case NOTIFICATION_REQUEST_TYPE.create_group:
		case NOTIFICATION_REQUEST_TYPE.add_participant_into_group:
			// first index should contain fromWhom username or name, second index should contain group name which could be retrieved from additional data
			return [additionalDataResponse.parsedAdditionalData[0], additionalDataResponse.parsedAdditionalData[3]];
		default:
			break;
	}

}

/**
 * 
 * Returns specific info from additional parameters
 * 
 * @param {*} data main service data
 */
function returnSenderInfo(data) {
	switch (returnRequesType(data)) {
		case NOTIFICATION_REQUEST_TYPE.followRequest:
		case NOTIFICATION_REQUEST_TYPE.createFollowDirectly:

			const additionalDataResponse = parseAdditionalData(data);

			if (additionalDataResponse.additionalDataExists) {
				if (additionalDataResponse.parsedAdditionalData !== undefined && additionalDataResponse.parsedAdditionalData !== null) {
					
					const dataArray = additionalDataResponse.parsedAdditionalData;

					if (Array.isArray(dataArray)) {
						for (let index = 0; index < dataArray.length; index++) {
							const element = dataArray[index];
							
							if (element.toString().trim() !== null && element.toString().trim() !== "") {
								return element
							}
						}

					}

				}

			} else {
				if (data.additionalData.username !== undefined && data.additionalData.username !== null && data.additionalData.username !== "") {
					return data.additionalData.username
				} else if (data.additionalData.name !== undefined && data.additionalData.name !== null && data.additionalData.name !== "") {
					return data.additionalData.name
				}
			}
		
			break;
		case NOTIFICATION_REQUEST_TYPE.create_group:
			return ["deneme1", "deneme2"];
		default:
			break;
	}
}

/**
 *
 * Function creates notified relation between nodes, in order not to send push notification again
 *
 * @param {*} toWhom userid value
 * @param {*} data contains main body, user endpoint response and the fact that user is notified or not
 * 
 */
function createUserNotifiedConnection(toWhom, data) {
	console.log("createUserNotifiedConnection starts");
	console.log("data : ", data);
	console.log("toWhom : ", toWhom);

	return new Promise(function(resolve, reject) {

		var { query, parameter } = returnNeo4jQueryAndParams(createRequiredParameters(), data);

		console.log("query		: ", query);
		console.log("parameter	: ", parameter);
	
		neo4jSession.run(query, parameter).then(result => { 
			console.log("RESULT neo4jsession : ", result);
			resolve(true);
		})
		.catch(error => { 
			console.log("ERROR neo4jsession : ", error);
			reject(false)
		});

	})

	// creates required parameters according to coming parameters
	function createRequiredParameters() {
		return {
			fromWhom: data.fromWhom,
			toWhom: toWhom,
			operationType: OPERATION_TYPES.createNotifiedConnection,
		};
	}
}

/**
 * 
 * The function below disables input endpoint in neo4j
 * 
 * @param {*} endpoint endpoint data
 */
function disableEndpoint(endpoint) {
	console.log("disableEndpoint starts");

	return new Promise(function(resolve, reject) { 

		var { query, parameter } = returnNeo4jQueryAndParams(createRequiredParameters());

		neo4jSession.run(query, parameter).then(result => {
			console.log("RESULT disableEndpoint : ", result);
			resolve(true);
		})
		.catch(error => {
			console.log("ERROR disableEndpoint : ", error);
			reject(false);
		})

	})

	// creates required parameters according to coming parameters
	function createRequiredParameters() {
		return {
			endpointData : endpoint,
			operationType: OPERATION_TYPES.disableEndpoint,
		};
	}
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
		default:
			message = "Undefined error occured";
	}
	return message;
};

