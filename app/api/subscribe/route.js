import * as FormData from 'form-data';
  import Mailgun from 'mailgun.js';
const mailgun = new Mailgun(FormData);
const mg = mailgun.client({username: 'api', key: process.env.MAILGUN_API_KEY || 'key-yourkeyhere'});

// const mg = mailgun({ apiKey: process.env.MAILGUN_API_KEY, domain: process.env.MAILGUN_DOMAIN });
const listAddress = process.env.MAILGUN_LIST_ADDRESS;

export async function POST(req) {
    const { email } = await req.json();

    if (!email) {
        return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400 });
    }

    try {

        console.log('Subscribing to mailing list')
        mg.lists.members.createMember(process.env.MAILGUN_LIST_ADDRESS, {
            address: email,
            subscribed: 'yes', // optional, modifiable on website
            upsert: 'yes', // optional, choose yes to insert if not exist, or update it exist
        })
            .then(data => console.log(data)) // logs response body
            .catch(err => console.error(err)); // logs any error
        console.log('Subscribed to mailing list')
        return new Response(JSON.stringify({ message: 'Subscription successful ✅' }), { status: 200 });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Error subscribing to the mailing list' }), { status: 500 });
    }
}
