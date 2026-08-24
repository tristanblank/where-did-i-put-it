import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Called when the walkthrough throws, so the host can close it. */
  onError: () => void;
};

type State = { failed: boolean };

/**
 * Closes the walkthrough instead of taking the app down with it.
 *
 * This exists because of what a crash here actually costs. The walkthrough
 * is the first thing a brand-new account sees, it covers the whole screen,
 * and nothing in the app depends on it — so a render error in it is both
 * the least important failure in the product and the one that lands in
 * front of someone who has not seen the app work yet.
 *
 * It is a net, not a fix. Anything it catches is still a bug, and it logs
 * loudly enough to be found in a dev-client session.
 */
export class TutorialBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error('Tutorial crashed, closing it', error);
    this.props.onError();
  }

  render() {
    // Render nothing at all rather than an apology. The home screen is
    // already mounted underneath and is where this was heading anyway.
    return this.state.failed ? null : this.props.children;
  }
}
