import { useEffect, useState } from "react";
import * as api from "../api.js";
import { Spinner, EmptyState, Banner } from "./ui.jsx";
import { formatDate, resolveUserLabel, isStaffRole } from "../utils.js";

export default function CommentThread({
  token,
  complaintId,
  session,
  staffMap = {},
}) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");

  const staff = isStaffRole(session?.role);

  useEffect(() => {
    let cancelled = false;

    api.getComments(token, complaintId).then(
      (data) => {
        if (cancelled) return;
        setComments(data);
        setLoadError("");
        setLoading(false);
      },
      (err) => {
        if (cancelled) return;
        setLoadError(err.message || "Unable to load comments.");
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [token, complaintId, reloadKey]);

  function retryLoad() {
    setLoading(true);
    setReloadKey((value) => value + 1);
  }

  async function handlePost(event) {
    event.preventDefault();
    setPostError("");

    if (!text.trim()) {
      setPostError("Write a comment before posting.");
      return;
    }

    setPosting(true);
    try {
      await api.addComment(token, complaintId, {
        comment: text.trim(),
        is_internal: staff ? internal : false,
      });
      setText("");
      setInternal(false);
      retryLoad();
    } catch (err) {
      setPostError(err.message || "Unable to post comment.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="comments-panel">
      <div className="panel-heading">
        <div>
          <h2>Comments</h2>
          <p>
            {staff
              ? "Staff replies are visible to the reporter. Internal notes stay staff-only."
              : "Updates from the support team about your complaint."}
          </p>
        </div>
      </div>

      {loading && <Spinner label="Loading comments..." />}

      {!loading && loadError && (
        <Banner type="error" message={loadError} onClose={retryLoad} />
      )}

      {!loading && !loadError && comments.length === 0 && (
        <EmptyState
          title="No comments yet."
          hint="Start the conversation below."
        />
      )}

      {!loading && !loadError && comments.length > 0 && (
        <ul className="comment-list">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className={
                comment.is_internal ? "comment-item internal" : "comment-item"
              }
            >
              <div className="comment-meta">
                <strong>
                  {resolveUserLabel(comment.user_id, session, staffMap)}
                </strong>
                {comment.is_internal && (
                  <span className="internal-badge">Internal</span>
                )}
                <span className="comment-time">
                  {formatDate(comment.created_at)}
                </span>
              </div>
              <p className="comment-body">{comment.comment}</p>
            </li>
          ))}
        </ul>
      )}

      <form className="comment-form" onSubmit={handlePost}>
        <label htmlFor="comment-text">Add a comment</label>
        <textarea
          id="comment-text"
          rows="3"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write your update..."
        />

        {staff && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={internal}
              onChange={(event) => setInternal(event.target.checked)}
            />
            <span>Mark as internal note (hidden from the reporter)</span>
          </label>
        )}

        <Banner type="error" message={postError} onClose={() => setPostError("")} />

        <button className="primary-button" type="submit" disabled={posting}>
          {posting ? "Posting..." : "Post Comment"}
        </button>
      </form>
    </section>
  );
}
