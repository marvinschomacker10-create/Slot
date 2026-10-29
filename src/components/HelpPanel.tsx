export function HelpPanel() {
  return (
    <div className="help">
      <h3>How to play</h3>
      <ol>
        <li>Choose a line bet with the − and + buttons. The total bet is the line bet times 20 paylines.</li>
        <li>
          Press SPIN (or the space bar). The stake is deducted and the result is decided immediately by the game engine.
        </li>
        <li>The reels then animate to that result. Animation speed never changes what you win.</li>
        <li>
          Three or more Orbit Scatters start free spins, which play automatically unless you switch that off in
          Settings.
        </li>
      </ol>
      <h3>Keyboard</h3>
      <dl className="shortcuts">
        <div>
          <dt>Space / Enter</dt>
          <dd>Spin (press again while spinning to stop the reels quickly)</dd>
        </div>
        <div>
          <dt>+ / −, ↑ / ↓</dt>
          <dd>Change the bet</dd>
        </div>
        <div>
          <dt>T</dt>
          <dd>Toggle fast spin</dd>
        </div>
        <div>
          <dt>P, H, S</dt>
          <dd>Open paytable, help, statistics</dd>
        </div>
        <div>
          <dt>Esc</dt>
          <dd>Close a dialog</dd>
        </div>
      </dl>
      <h3>About this prototype</h3>
      <p>
        Gilded Orbit is an original play-money game prototype for evaluating game rules, mathematics and presentation.
        It is not certified, not approved by any regulator and not connected to real money. Outcomes are generated in
        your browser with the Web Crypto random number generator, which is suitable for play money only. See
        docs/REGULATORY_READINESS.md for what real-money operation would require.
      </p>
      <p>
        Gambling can be harmful. If you or someone you know is struggling with gambling, seek support from a local help
        service.
      </p>
    </div>
  );
}
