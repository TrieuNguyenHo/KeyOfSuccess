// The app's name. K and S, KingSport's initials, are set about 5 times the size of the other letters and O about
// twice (see .brand in styles/base.css). Screen readers still read one word: "KeyOfSuccess".
export function Brand({ className = '' }) {
  return (
    <span className={`brand ${className}`}>
      <span className="ks">K</span>ey<span className="o">O</span>f<span className="ks">S</span>uccess
    </span>
  );
}
