/* Presentation helpers for the authentication screens. */
window.AuthInterface = (() => {
  const messages = {
    login: ['Your next chapter starts here.', 'From your first shift to your final requirement. Give your internship a little more clarity.'],
    signup: ['Small steps. Real progress.', 'Keep your hours, accomplishments, and OJT requirements together as you build your experience.'],
    'signup-professor': ['More clarity for every student.', 'One place to guide your class, connect students, and keep OJT requirements moving forward.'],
    forgot: ['A fresh start is a click away.', 'Get back to your hours, your requirements, and the progress you have made.'],
    reset: ['Ready for your next step.', 'Set a new password and return to your OJT workspace.'],
  };
  function sync(page) {
    const [title, description] = messages[page] || messages.login;
    document.getElementById('auth-welcome-title').textContent = title;
    document.getElementById('auth-welcome-description').textContent = description;
    document.querySelectorAll('.auth-password-toggle').forEach(button => {
      const input = document.getElementById(button.dataset.passwordFor);
      input.type = 'password';
      button.textContent = 'Show';
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `Show ${button.dataset.fieldLabel}`);
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.auth-password-toggle').forEach(button => {
      button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.passwordFor);
        const visible = input.type === 'password';
        input.type = visible ? 'text' : 'password';
        button.textContent = visible ? 'Hide' : 'Show';
        button.setAttribute('aria-pressed', String(visible));
        button.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} ${button.dataset.fieldLabel}`);
      });
    });
  });
  return { sync };
})();
