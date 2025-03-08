/**
 * index.js
 * ========
 * Recibe el comando de Slack, VERIFICA la FIRMA, responde inmediatamente.
 * Inserta un registro en Orbit2Records con status="pending".
 */

const querystring = require('querystring');
const crypto = require('crypto');
const AWS = require('aws-sdk');

// Obtenemos la SECRET desde variables de entorno
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

const dynamoDb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    console.log("Event body (raw):", event.body);

    // 1) Validar firma
    if (!validateSlackRequest(event)) {
      // si falla, respondemos 401
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: "Invalid Slack Signature" }),
      };
    }

    // 2) Decodificar body y parsear
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;

    const decodedBody = querystring.parse(rawBody);
    console.log("Decoded body (parsed):", decodedBody);

    // 3) Generar requestId y armar Item
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
      TableName: 'Orbit2Records', // ajusta a tu tabla
      Item: item,
    }).promise();

    console.log("Data saved to Orbit2Records:", item);

    // 4) Responder a Slack
    const responseText = `Hi *${item.user_name || "there"}*, Orbit has received your request and is working on it. Req number: ${requestId}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: responseText }),
    };

  } catch (error) {
    console.error("Error in index.js:", error);

    // En caso de error interno
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: "Internal Server Error" }),
    };
  }
};

/**
 * validateSlackRequest => valida la firma de Slack
 * Slack envía:
 *  - X-Slack-Signature (ej. "v0=abcd1234...")
 *  - X-Slack-Request-Timestamp (UNIX)
 *
 * Paso a paso:
 * 1) Tomamos "v0:${timestamp}:${rawBody}" => hmac con SHA256 usando SLACK_SIGNING_SECRET
 * 2) Comparamos con la firma que Slack envía
 * 3) Aseguramos que la request no sea muy vieja (por ejemplo, > 5 minutos)
 */
function validateSlackRequest(event) {
  if (!SLACK_SIGNING_SECRET) {
    console.warn("No Slack signing secret set, skipping signature check");
    return true; // O false, según tu preferencia
  }

  // Slack manda las cabeceras en event.headers, en minúsculas a veces
  const slackSignature = event.headers['x-slack-signature'] 
                      || event.headers['X-Slack-Signature'];
  const slackTimestamp = event.headers['x-slack-request-timestamp'] 
                      || event.headers['X-Slack-Request-Timestamp'];

  if (!slackSignature || !slackTimestamp) {
    console.warn("Missing Slack signature or timestamp");
    return false;
  }

  // Verificar que el timestamp no sea muy viejo
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - slackTimestamp) > 60 * 5) {
    console.warn(`Slack request too old. now=${now}, slackTimestamp=${slackTimestamp}`);
    return false;
  }

  // Construir la base string => "v0:${slackTimestamp}:${rawBody}"
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  const sigBaseString = `v0:${slackTimestamp}:${rawBody}`;

  // Calcular la firma con HMAC-SHA256
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', SLACK_SIGNING_SECRET)
    .update(sigBaseString, 'utf8')
    .digest('hex');

  console.log("SlackSignature provided:", slackSignature);
  console.log("SlackSignature computed:", mySignature);

  // Comparar usando tiempo constante
  return crypto.timingSafeEqual(
    Buffer.from(mySignature, 'utf8'),
    Buffer.from(slackSignature, 'utf8')
  );
}
