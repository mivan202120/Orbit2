/**
 * index.js
 * ========
 * Recibe la solicitud de Slack y responde inmediatamente. Inserta ORBIT_REQUESTS con status="pending".
 * Usa CommonJS (require/exports) para Node18.x en AWS Lambda.
 */

const querystring = require('querystring');
const crypto = require('crypto');
const AWS = require('aws-sdk');

const dynamoDb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    console.log("Event body (raw):", event.body);

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;

    const decodedBody = querystring.parse(rawBody);
    console.log("Decoded body (parsed):", decodedBody);

    const requestId = crypto.randomUUID();
    const timestamp = Date.now();
    const readableTimestamp = new Date(timestamp).toISOString();

    const item = {
      request_id: requestId,
      api_app_id: decodedBody.api_app_id,
      channel_id: decodedBody.channel_id,
      channel_name: decodedBody.channel_name,
      command: decodedBody.command,
      created_at: timestamp,
      created_at_readable: readableTimestamp,
      is_enterprise_install: decodedBody.is_enterprise_install === 'true',
      response_url: decodedBody.response_url,
      status: 'pending',
      team_domain: decodedBody.team_domain,
      team_id: decodedBody.team_id,
      text: decodedBody.text,
      trigger_id: decodedBody.trigger_id,
      user_id: decodedBody.user_id,
      user_name: decodedBody.user_name,
    };

    await dynamoDb.put({
      TableName: 'ORBIT_REQUESTS',
      Item: item,
    }).promise();

    console.log("Data saved to ORBIT_REQUESTS:", item);

    const responseText = `Hi *${item.user_name || "there"}*, Orbit has received your request and is working on it. Req number: ${requestId}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: responseText }),
    };
  } catch (error) {
    console.error("Error in index.js:", error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: "Internal Server Error" }),
    };
  }
};