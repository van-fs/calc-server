const bodyParser = require('body-parser');
const cors = require('cors');
const express = require('express');
const Octokit = require('@octokit/rest')
const dotenv = require('dotenv');
const request = require('request-promise');

dotenv.config();

// retrieve the runtime vars bound to the application
const {
  GITHUB_USERNAME: username,
  GITHUB_PASSWORD: password,
  FULLSTORY_APIKEY: fsApiKey,
} = process.env;

console.log(`GitHub configured - ${username !== undefined && password !== undefined}`);

// create the GitHub client
const octokit = new Octokit({
  auth: {
    username,
    password,
  }
});

// initialize the Express server
const app = express();
app.use(cors());  // use CORS since local dev runs on 4200 and Express runs on 3000

app.set('port', process.env.PORT || 3000);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use('/public', express.static(`${__dirname}/public`));  // contains the Angular static files

app.get('favicon.png', (req, res) => {
  res.sendFile(`${__dirname}/favicon.png`);
});

// issues middleware
app.post('/issues', async (req, res) => {
  console.log(`Incoming bug`);
  createIssue(req.body, res);
});

app.get('/issues/:id', async (req, res) => {
  const { id } = req.params;
  getIssue(id, res);
});

// redirect all other requests to web app
app.get('*', (req, res) => {
  res.sendFile(`${__dirname}/public/index.html`);
});

// launch the server
app.listen(app.get('port'), () => {
  console.log(`Express server listening on ${app.get('port')}`);
});

/**
 * Creates an issue in GitHub.
 * @param {any} obj An object containing issue metadata. 
 * @param {Response} res The response used to send the issue back to the caller
 */
function createIssue({ content, sessionUrl, replayUrl }, res) {
  try {
    // use the session URL to pull out metadata about the session
    const [userId, sessionId, otherId] = decodeURIComponent(sessionUrl.substring(sessionUrl.lastIndexOf('/') + 1)).split(':');

    // deprecated - was going to allow the issue to link back to a local app
    if (!replayUrl) {
      replayUrl = 'http://localhost:4200'
    }

    // the issue's content in markdown
    const body = `
  | | |
  | ---- | ---- |
  | User | [${userId}](https://app.fullstory.com/ui/MKDN5/segments/everyone/people/0/user/${userId}) |
  | Session ID | ${sessionId} |
  | Timestamp | ${ (new Date()).getTime()}|
  | FullStory Replay | [View Replay](${sessionUrl})  |`;

    // create the issue on the calc-app repo
    octokit.issues.create({
      owner: 'van-fs',
      repo: 'calc-app',
      title: `${content}`,
      body,
      labels: ['fullstory']
    }).then(({ data }) => res.json(data));
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
}

/**
 * Retreives a list of FullStory events for a given GitHub issue.
 * @param {} issue_number The GitHub issue id
 * @param {*} res The response used to send the events back to the caller
 */
async function getIssue(issue_number, res) {
  console.log(`Fetching issue ${issue_number}`);

  try {
    // retrieve the issue
    const { data: issue } = await octokit.issues.get({
      owner: 'van-fs',
      repo: 'calc-app',
      issue_number
    });

    // retrieve the list of available bundles in FullStory
    const { exports: bundles} = await request({
      url: 'https://export.fullstory.com/api/v1/export/list',
      headers: {
        'Authorization': `Basic ${fsApiKey}`
      },
      json: true
    });

    // tokenize the issue to find metadata required to locate the correct bundle
    const tokens = issue.body.split('|');
    let sessionId = +tokens[8].trim();
    let timestamp = +tokens[11].trim()

    // filter the available bundles based on timestamp of the bug
    const bundle = bundles.filter(bundle => bundle.Start <= timestamp && bundle.Stop >= timestamp);

    // the filter returns an array but there shoud be only one matching bundle
    if (bundle.length === 1) {
      // get the FS export id
      const { Id: bundleId } = bundle[0];

      // retrieve the actual events from FS
      let events = await request({
        url: `https://export.fullstory.com/api/v1/export/get?id=${bundleId}`,
        headers: {
          'Authorization': `Basic ${fsApiKey}`
        },
        json: true,
      });
    
      // get only the events that match the session ID for this issue
      events = events.filter(event => event.SessionId === sessionId);

      // TODO a more interesting hueristic is to then get all events from the last page load up to the timestamp

      // send back the events
      res.json(events);
    } else {
      res.json([]);
    }
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
}
