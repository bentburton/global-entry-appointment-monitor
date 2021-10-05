import axios from 'axios';
import { Twilio } from 'twilio';

interface Appointment {
  locationId: number;
  startTimestamp: string;
  endTimestamp: string;
  active: boolean;
  duration: number;
  remoteInd: boolean;
}

interface APIResponse {
  data: Appointment[];
}

const initTwilio = (): Twilio => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid) throw new Error('missing TWILIO_ACCOUNT_SID');
  if (!authToken) throw new Error('missing TWILIO_AUTH_TOKEN');

  const client = new Twilio(accountSid, authToken);
  return client;
};

const sendText = (client: Twilio, body: string) => {
  const myPhoneNumber = process.env.MY_PHONE_NUMBER;
  const twillioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!myPhoneNumber) throw new Error('missing MY_PHONE_NUMBER');
  if (!twillioPhoneNumber) throw new Error('missing TWILIO_PHONE_NUMBER');

  client.messages
    .create({
      body,
      to: myPhoneNumber,
      from: twillioPhoneNumber,
    })
    .then((message: any) => console.log(message.sid));
};

const parsePreviousBody = (body: string): Date => {
  const dateString = body.split('Date:')[1];
  return new Date(dateString);
};

const checkShouldSendText = (client: Twilio, latestAppointmentTime: Date) => {
  return client.messages.list({ limit: 20 }).then(messages => {
    const latestMessage = messages[0];
    const previousAppointmentDate = parsePreviousBody(latestMessage.body);

    return previousAppointmentDate !== latestAppointmentTime;
  });
};

const getAppointments = async (): Promise<Appointment[]> => {
  try {
    const apiURL = process.env.API_URL ? process.env.API_URL : '';
    const response: APIResponse = await axios.get(apiURL);
    return response.data;
  } catch {
    console.log('api failure');
  }
  return [];
};

const createBody = (latestAppointmentTime: Date): string => {
  const body = `There is a new appointment available. https://ttp.cbp.dhs.gov/ Date: ${latestAppointmentTime}`;

  return body;
};

export const run = async () => {
  console.log('starting');

  if (!process.env.APPOINTMENT_THRESHOLD) {
    return;
  }
  const currentAppointmentTime = new Date(process.env.APPOINTMENT_THRESHOLD);

  if (!currentAppointmentTime || Number.isNaN(currentAppointmentTime.getTime()))
    throw new Error('invalid Date');

  const appointments = await getAppointments();
  const latestAppointment = appointments[0];
  const latestAppointmentTime = new Date(latestAppointment.startTimestamp);

  console.log('appointment threshold: ', currentAppointmentTime);
  console.log('latest appointment time', latestAppointmentTime);

  if (latestAppointmentTime < currentAppointmentTime) {
    console.log('theres a new appointment');

    const client = initTwilio();
    checkShouldSendText(client, latestAppointmentTime)
      .then(shouldSendText => {
        if (shouldSendText) {
          console.log('sending text');
          const body = createBody(latestAppointmentTime);
          sendText(client, body);
        } else {
          console.log('we already sent this text');
        }
      })
      .catch(e => {
        console.log('error', e);
      });
  } else {
    console.log('no new appointments');
  }
};
