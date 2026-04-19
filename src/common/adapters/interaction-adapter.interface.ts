/**
 * Channel-agnostic interface for asking the user to approve a potentially
 * dangerous action (e.g. a shell command). Each channel (CLI, Telegram, etc.)
 * provides its own implementation.
 *
 * Implementations MUST NOT reject on their own (no timeouts, no auto-reject).
 * A rejection is only returned when the user explicitly says "no".
 */
export interface IInteractionAdapter {
  /**
   * Ask the user whether the agent is allowed to execute the given command.
   *
   * @param command  The exact command string the agent wants to run.
   * @returns `true` if the user approves, `false` if the user explicitly rejects.
   */
  askForApproval(command: string): Promise<boolean>;
}

/**
 * Safe default for code paths that have no interactive channel available.
 * Always rejects. Prevents an uncontrolled "paired with nobody" execution.
 */
export class NoopInteractionAdapter implements IInteractionAdapter {
  async askForApproval(_command: string): Promise<boolean> {
    return false;
  }
}
