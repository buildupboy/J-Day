export default function MessageList({ messages, interim }) {
  return (
    <ul className="message-list">
      {messages.map((m) => (
        <li key={m.id} className={`message message-${m.role}`}>
          {m.text}
        </li>
      ))}
      {interim && <li className="message message-user message-interim">{interim}</li>}
    </ul>
  );
}
