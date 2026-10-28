import { Component } from 'react';

/* Se il disegno di una pianta fallisce, si mostra un messaggio invece di lasciare l'app vuota.
   Si azzera cambiando `key` (una pianta diversa rimonta il componente). */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="pf-alert" role="alert" style={{ margin: 20 }}>
          <span>Non riesco a disegnare questa pianta ({String(this.state.error.message || this.state.error)}). Prova a rigenerarla o aprine un'altra dalla cronologia.</span>
        </div>
      );
    }
    return this.props.children;
  }
}
