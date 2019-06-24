const bodyParser = require('body-parser');
const cors = require('cors');
const express = require('express');
const Octokit = require('@octokit/rest')
const dotenv = require('dotenv');
const request = require('request-promise');

dotenv.config();

const {
  GITHUB_USERNAME: username,
  GITHUB_PASSWORD: password,
  FULLSTORY_APIKEY: fsApiKey,
} = process.env;

console.log(`GitHub configured - ${username !== undefined && password !== undefined}`);

const octokit = new Octokit({
  auth: {
    username,
    password,
  }
});

const app = express();
app.use(cors());

app.set('port', process.env.PORT || 3000);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use('/public', express.static(`${__dirname}/public`));

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


app.listen(app.get('port'), () => {
  console.log(`Express server listening on ${app.get('port')}`);
});

/**
 * Creates an issue on GitHub.
 * @param obj An Error object that has a `error` property
 */
function createIssue({ content, sessionUrl, replayUrl }, res) {
  try {
    const [userId, sessionId, otherId] = decodeURIComponent(sessionUrl.substring(sessionUrl.lastIndexOf('/') + 1)).split(':');

    if (!replayUrl) {
      replayUrl = 'http://localhost:4200'
    }

    const body = `
  | | |
  | ---- | ---- |
  | User | [${userId}](https://app.fullstory.com/ui/MKDN5/segments/everyone/people/0/user/${userId}) |
  | Session ID | ${sessionId} |
  | Timestamp | ${ (new Date()).getTime()}|
  | FullStory Replay | [View Replay](${sessionUrl})  |`;

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

async function getIssue(issue_number, res) {
  console.log(`Fetching issue ${issue_number}`);

  try {
    const { data: issue } = await octokit.issues.get({
      owner: 'van-fs',
      repo: 'calc-app',
      issue_number
    });

    const { exports: bundles} = await request({
      url: 'https://export.fullstory.com/api/v1/export/list',
      headers: {
        'Authorization': `Basic ${fsApiKey}`
      },
      json: true
    });

    const tokens = issue.body.split('|');
    let sessionId = +tokens[8].trim();
    let timestamp = +tokens[11].trim()

    const bundle = bundles.filter(bundle => bundle.Start <= timestamp && bundle.Stop >= timestamp);

    if (bundle.length === 1) {
      const { Id: bundleId } = bundle[0];
      let events = await request({
        url: `https://export.fullstory.com/api/v1/export/get?id=${bundleId}`,
        headers: {
          'Authorization': `Basic ${fsApiKey}`
        },
        json: true,
      });
    
      events = events.filter(event => event.SessionId === sessionId);
      
      res.json(events);
    } else {
      res.json([]);
    }
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
}
