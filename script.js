let output = '';
let style = 'webClipper';
let escapeNewLine = false;
let spaceComment = false;
let excludeDeleted = false;

document.addEventListener('DOMContentLoaded', () => {
  const urlField = document.getElementById('url-field');
  const exportBtn = document.getElementById('exportBtn');
  const outputDisplay = document.getElementById('outputDisplay');
  const outputContainer = document.getElementById('outputContainer');
  const downloadLink = document.getElementById('downloadLink');
  const moreCommentsWarning = document.getElementById('moreCommentsWarning');

  exportBtn.addEventListener('click', startExport);

  function startExport() {
    const url = urlField.value.trim();
    if (!url) {
      alert('Please enter a valid Reddit post URL');
      return;
    }

    setOptions();
    if (style === 'api') {
      fetchWithArcticAPI(url);
    } else {
      fetchRedditData(url);
    }
  }

  function setOptions() {
    style = document.querySelector('input[name="exportStyle"]:checked').value;
    escapeNewLine = document.getElementById('escapeNewLine').checked;
    spaceComment = document.getElementById('spaceComment').checked;
    excludeDeleted = document.getElementById('excludeDeleted').checked;
  }

  function fetchRedditData(url) {
    output = '';
    outputContainer.style.display = "none";
    if (moreCommentsWarning) moreCommentsWarning.style.display = "none";

    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${url}.json`);
    xhr.responseType = 'json';

    xhr.onload = () => {
      try {
        if (xhr.status !== 200) {
          alert('Failed to fetch Reddit post. Check the URL and try again.');
          return;
        }

        const data = xhr.response;
        const post = data[0]?.data?.children?.[0]?.data;
        const comments = data[1]?.data?.children || [];
        const hasMoreComments = containsMoreComments(comments);

        if (!post) {
          alert('Could not find post data.');
          return;
        }

        displayPost(post);
        output += '\n\n## Comments\n\n';

        let commentCount = 0;
        comments.forEach(comment => {
          if (comment.kind === "t1" && shouldRenderComment(comment.data)) {
            try {
              if (commentCount > 0) output += spaceComment ? '\n\n' : '\n';
              displayComment(comment, comment.data?.depth || 0);
              commentCount++;
            } catch (e) {
              console.warn('Skipping comment due to error:', comment, e);
            }
          }
        });

        if (moreCommentsWarning) {
          moreCommentsWarning.style.display = hasMoreComments ? "block" : "none";
        }

        outputDisplay.textContent = output;
        outputContainer.style.display = "flex";

        document.getElementById("summaryTitle").textContent = post.title;
        document.getElementById("summaryAuthor").textContent = post.author;
        document.getElementById("summaryUps").textContent = post.ups;
        document.getElementById("summaryComments").textContent = commentCount;
        document.getElementById("summaryPermalink").href = "https://reddit.com" + post.permalink;

        const blob = new Blob([output], { type: 'text/plain' });
        const safeTitle = post.title.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 50);
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = `${safeTitle || 'reddit_thread'}.md`;
        downloadLink.classList.remove('hidden');
        downloadLink.hidden = false;
      } catch (err) {
        alert('Something went wrong while processing the Reddit data.');
        console.error('Processing error:', err);
      }
    };

    xhr.onerror = () => alert('Network error occurred while fetching the Reddit post.');
    xhr.send();
  }

  function displayPost(post) {
    if (style === 'webClipper') {
      if (post.selftext) {
        output += `${post.selftext}\n`;
      } else {
        output += `# ${post.title}\n`;
      }
      output += '\n---';
      return;
    }

    output += `# ${post.title}\n`;
    if (post.selftext) {
      output += `\n${post.selftext}\n`;
    }
    output += `\n[permalink](https://reddit.com${post.permalink})`;
    output += `\nby *${post.author}* (↑ ${post.ups} / ↓ ${post.downs})`;
  }

  function escapeMarkdownText(text) {
    return String(text).replace(/([\\`*_{}[\]()#+!|-])/g, '\\$1');
  }

  function formatDate(createdUtc) {
    if (!createdUtc) return 'unknown-date';
    return new Date(createdUtc * 1000).toISOString().slice(0, 10);
  }

  function formatComment(text) {
    return escapeNewLine ? text.replace(/(\r\n|\n|\r)/gm, '') : text;
  }

  function shouldRenderComment(commentData) {
    if (!commentData?.body) return false;

    if (style === 'webClipper') return true;

    return !(excludeDeleted && commentData?.author === "[deleted]");
  }

  function containsMoreComments(nodes, visited = new WeakSet()) {
    if (!Array.isArray(nodes)) return false;

    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      if (visited.has(node)) continue;
      visited.add(node);

      if (node.kind === "more" || node.data?.kind === "more") {
        return true;
      }

      if (containsMoreComments(node.data?.replies?.data?.children, visited)) {
        return true;
      }

      if (containsMoreComments(node.data?.children, visited)) {
        return true;
      }
    }

    return false;
  }

  function getCommentPrefix(depth) {
    if (style === 'tree') {
      const indent = '─'.repeat(depth);
      return indent ? `├${indent} ` : '##### ';
    }

    if (style === 'list' || style === 'api') {
      const indent = '\t'.repeat(depth);
      return indent ? `${indent}- ` : '- ';
    }

    return depth > 0 ? `> ${'> '.repeat(depth)}` : '> ';
  }

  function displayComment(comment, depth) {
    const { body, author, ups, downs, replies, created_utc, permalink } = comment.data || {};
    if (!shouldRenderComment(comment.data)) return;

    const prefix = getCommentPrefix(depth);
    const formattedBody = formatComment(body);
    const bodyLines = formattedBody.split(/\r\n|\n|\r/);

    if (style === 'webClipper') {
      const safeAuthor = escapeMarkdownText(author || '[deleted]');
      const date = formatDate(created_utc);
      const pointsLabel = ups === 1 ? 'point' : 'points';
      const commentUrl = permalink ? `https://reddit.com${permalink}` : 'https://reddit.com';

      output += `${prefix}**${safeAuthor}** · [${date}](${commentUrl}) · ${ups} ${pointsLabel}\n`;
      output += `${prefix}\n`;
      bodyLines.forEach(line => {
        output += `${prefix}${line}\n`;
      });
      output += `${prefix}\n`;
    } else {
      const prefixedBody = bodyLines.map(line => `${prefix}${line}`).join('\n');
      const metadata = `${prefix}⏤ by *${author}* (↑ ${ups} / ↓ ${downs})`;
      const commentLine = bodyLines.length > 1
        ? `${prefixedBody}\n${metadata}`
        : `${prefixedBody} ${metadata.slice(prefix.length)}`;
      output += `${commentLine}\n`;
    }

    if (replies?.data?.children?.length) {
      replies.data.children.forEach(reply => displayComment(reply, depth + 1));
    }

  }

  function extractPostId(url) {
    const match = url.match(/reddit\.com\/r\/[^/]+\/comments\/([a-z0-9]+)/i);
    return match ? match[1] : null;
  }

  function normalizeCommentNode(node) {
    if (node.kind !== 't1' || !node.data) return;
    const d = node.data;
    if (d.ups === undefined || d.ups === null) d.ups = d.score ?? 0;
    if (d.downs === undefined || d.downs === null) d.downs = 0;
    const children = d.replies?.data?.children;
    if (Array.isArray(children)) {
      children.forEach(normalizeCommentNode);
    }
  }

  function fetchWithArcticAPI(url) {
    output = '';
    outputContainer.style.display = "none";
    if (moreCommentsWarning) moreCommentsWarning.style.display = "none";

    const postId = extractPostId(url);
    if (!postId) {
      alert('Could not extract post ID from URL.');
      return;
    }

    const BASE = 'https://arctic-shift.photon-reddit.com';

    Promise.all([
      fetch(`${BASE}/api/posts/ids?ids=${postId}`).then(r => r.json()),
      fetch(`${BASE}/api/comments/tree?link_id=t3_${postId}&limit=9999`).then(r => r.json())
    ]).then(([postRes, commentsRes]) => {
      try {
        const post = postRes.data?.[0];
        const comments = commentsRes.data || [];

        if (!post) {
          alert('Could not find post data. The post may not be archived yet.');
          return;
        }

        post.ups = post.ups ?? post.score ?? 0;
        post.downs = post.downs ?? 0;
        if (!post.permalink) {
          post.permalink = `/r/${post.subreddit}/comments/${post.id}/`;
        }

        comments.forEach(normalizeCommentNode);

        const hasMoreComments = containsMoreComments(comments);

        displayPost(post);
        output += '\n\n## Comments\n\n';

        let commentCount = 0;
        comments.forEach(comment => {
          if (comment.kind === "t1" && shouldRenderComment(comment.data)) {
            try {
              if (commentCount > 0) output += spaceComment ? '\n\n' : '\n';
              displayComment(comment, comment.data?.depth || 0);
              commentCount++;
            } catch (e) {
              console.warn('Skipping comment due to error:', comment, e);
            }
          }
        });

        if (moreCommentsWarning) {
          moreCommentsWarning.style.display = hasMoreComments ? "block" : "none";
        }

        outputDisplay.textContent = output;
        outputContainer.style.display = "flex";

        document.getElementById("summaryTitle").textContent = post.title;
        document.getElementById("summaryAuthor").textContent = post.author;
        document.getElementById("summaryUps").textContent = post.ups;
        document.getElementById("summaryComments").textContent = commentCount;
        document.getElementById("summaryPermalink").href = "https://reddit.com" + post.permalink;

        const blob = new Blob([output], { type: 'text/plain' });
        const safeTitle = post.title.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 50);
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = `${safeTitle || 'reddit_thread'}.md`;
        downloadLink.classList.remove('hidden');
        downloadLink.hidden = false;
      } catch (err) {
        alert('Something went wrong while processing the Reddit data.');
        console.error('Processing error:', err);
      }
    }).catch((err) => {
      console.error('Network error fetching from Arctic Shift API:', err);
      alert('Network error occurred while fetching from the Arctic Shift API.');
    });
  }

  document.getElementById("copyButton").addEventListener("click", () => {
    const output = document.getElementById("outputDisplay").textContent;
    navigator.clipboard.writeText(output).then(() => {
      const btn = document.getElementById("copyButton");
      btn.textContent = "✅";
      setTimeout(() => (btn.textContent = "📋"), 1500);
    });
  });
});
