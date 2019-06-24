# Calculator Server

Express-JS server for calculator demo.

## Usage

The server is used with the [calculator app](https://github.com/van-fs/calc-app). It's responsible to serve the Angular application as well as create GitHub issues and retrieve FullStory events.

It does this by responding to `GET` and `POST` requests for the `/issues` route.

- `GET` `/issues/${issueNumber}` - Retrieves FullStory events based on information stored in the GitHub issue
- `POST` `/issues` - Creates a GitHub issue with metadata from FullStory