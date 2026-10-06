// The app's name. O is twice the size of the other letters, and K and S, KingSport's initials, twice the O
// (see .brand in styles/base.css). Screen readers still read one word: "KeyOfSuccess".
export function Brand({ className = '' }) {
  return (
    <span className={`brand ${className}`}>
      <span className="ks">K</span>ey<span className="o">O</span>f<span className="ks">S</span>uccess
    </span>
  );
}
