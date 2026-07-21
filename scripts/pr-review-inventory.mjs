#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const prIndex = args.indexOf('--pr');
const explicitPr = prIndex === -1 ? undefined : args[prIndex + 1];
if (prIndex !== -1 && (!explicitPr || !/^\d+$/.test(explicitPr))) {
  throw new Error('--pr requires a numeric pull request number');
}

const repository = JSON.parse(
  execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner'], { encoding: 'utf8' })
).nameWithOwner;
const [owner, name] = repository.split('/');
if (!owner || !name) throw new Error(`Unable to parse repository name: ${repository}`);

const pr = JSON.parse(
  execFileSync(
    'gh',
    ['pr', 'view', ...(explicitPr ? [explicitPr] : []), '--json', 'number,headRefOid,url'],
    { encoding: 'utf8' }
  )
);

const runGraphql = (query, variables = []) =>
  JSON.parse(
    execFileSync('gh', ['api', 'graphql', '-f', `query=${query}`, ...variables], {
      encoding: 'utf8',
    })
  ).data;

const commentsQuery = `
  query ConversationComments($owner: String!, $name: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        comments(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id databaseId url body createdAt updatedAt author { login } reactionGroups { content users { totalCount } } }
        }
      }
    }
  }
`;
const reviewsQuery = `
  query Reviews($owner: String!, $name: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reviews(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id databaseId url body state submittedAt author { login } reactionGroups { content users { totalCount } } }
        }
      }
    }
  }
`;
const threadsQuery = `
  query ReviewThreads($owner: String!, $name: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reviewThreads(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id isResolved isOutdated isCollapsed path line originalLine
            comments(first: 100) {
              pageInfo { hasNextPage endCursor }
              nodes { id databaseId url body createdAt updatedAt state author { login } reactionGroups { content users { totalCount } } }
            }
          }
        }
      }
    }
  }
`;
const threadCommentsQuery = `
  query ThreadComments($threadId: ID!, $cursor: String) {
    node(id: $threadId) {
      ... on PullRequestReviewThread {
        comments(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id databaseId url body createdAt updatedAt state author { login } reactionGroups { content users { totalCount } } }
        }
      }
    }
  }
`;

const baseVariables = ['-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `number=${pr.number}`];

const conversationComments = [];
let commentsCursor;
do {
  const page = runGraphql(commentsQuery, [
    ...baseVariables,
    ...(commentsCursor ? ['-F', `cursor=${commentsCursor}`] : []),
  ]).repository.pullRequest.comments;
  conversationComments.push(...page.nodes);
  commentsCursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : undefined;
} while (commentsCursor);

const reviews = [];
let reviewsCursor;
do {
  const page = runGraphql(reviewsQuery, [
    ...baseVariables,
    ...(reviewsCursor ? ['-F', `cursor=${reviewsCursor}`] : []),
  ]).repository.pullRequest.reviews;
  reviews.push(...page.nodes);
  reviewsCursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : undefined;
} while (reviewsCursor);

const reviewThreads = [];
let threadsCursor;
do {
  const page = runGraphql(threadsQuery, [
    ...baseVariables,
    ...(threadsCursor ? ['-F', `cursor=${threadsCursor}`] : []),
  ]).repository.pullRequest.reviewThreads;
  reviewThreads.push(...page.nodes);
  threadsCursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : undefined;
} while (threadsCursor);

for (const thread of reviewThreads) {
  let threadCursor = thread.comments.pageInfo.hasNextPage
    ? thread.comments.pageInfo.endCursor
    : undefined;
  while (threadCursor) {
    const page = runGraphql(threadCommentsQuery, [
      '-F',
      `threadId=${thread.id}`,
      '-F',
      `cursor=${threadCursor}`,
    ]).node.comments;
    thread.comments.nodes.push(...page.nodes);
    threadCursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : undefined;
  }
}

const checksResult = spawnSync(
  'gh',
  ['pr', 'checks', String(pr.number), '--json', 'name,state,bucket,link,workflow'],
  { encoding: 'utf8' }
);
if (checksResult.error) throw checksResult.error;
const checks = JSON.parse(checksResult.stdout || '[]');

const inventory = {
  repository,
  pullRequest: pr.number,
  url: pr.url,
  headRefOid: pr.headRefOid,
  generatedAt: new Date().toISOString(),
  counts: {
    conversationComments: conversationComments.length,
    reviews: reviews.length,
    reviewThreads: reviewThreads.length,
    unresolvedThreads: reviewThreads.filter((thread) => !thread.isResolved).length,
    checks: checks.length,
    unsuccessfulChecks: checks.filter((check) => check.bucket !== 'pass').length,
  },
  conversationComments,
  reviews,
  reviewThreads,
  checks,
};

console.log(JSON.stringify(inventory, null, 2));
