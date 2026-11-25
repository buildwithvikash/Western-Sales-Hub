// Checks the mail settings in .env by logging in to the SMTP server. Sends no mail.
//   npm run check-mail -w server
import { verifyMail, from } from "../src/mailer.js";

try {
  const r = await verifyMail();
  console.log(
    r.transport === "graph"
      ? `Microsoft sign-in OK: Outlook will send from ${r.sender}${process.env.MAIL_REDIRECT_TO ? `; all mail redirected to ${process.env.MAIL_REDIRECT_TO}` : ""}. (Mail.Send consent and the mailbox are checked on the first send.)`
      : r.transport === "smtp"
      ? `SMTP login OK (${r.host}:${r.port}, from ${from()})${process.env.MAIL_REDIRECT_TO ? `; all mail redirected to ${process.env.MAIL_REDIRECT_TO}` : ""}`
      : 'MAIL_TRANSPORT is "log": emails are printed in the server console, not sent.',
  );
} catch (err) {
  console.error(`Mail check failed: ${err.message}`);
  process.exitCode = 1;
}
process.exit();
