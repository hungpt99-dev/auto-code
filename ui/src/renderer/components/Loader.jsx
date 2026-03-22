export default function Loader({ message = 'Loading…' }) {
  return (
    <div className="loader-wrap">
      <div className="spinner" aria-label="Loading" />
      <p className="loader-text">{message}</p>
    </div>
  );
}
