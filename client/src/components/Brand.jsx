// The app's name. K and S, KingSport's initials, are set about 8 times the size of the other letters
// (see .brand in styles/base.css). Screen readers still read one word: "KeyofSuccess".
export function Brand({ className = '' }) {
  return (
    <span className={`brand ${className}`}>
      <span className="ks">K</span>eyof<span className="ks">S</span>uccess
    </span>
  );
}
