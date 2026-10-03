"use client";

import { useActionState } from "react";
import { Button, inputStyles } from "@/components/ui";
import { connectWithTokenAction, type ConnectState } from "./actions";

export function TokenForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<ConnectState, FormData>(connectWithTokenAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="token" className="font-medium">
        Your Canvas token
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="token"
          name="token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          aria-invalid={!!state.error}
          aria-describedby={state.error ? "token-error" : undefined}
          className={`${inputStyles} font-mono`}
        />
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? "Checking with Canvas…" : "Connect"}
        </Button>
      </div>
      {state.error && (
        <p id="token-error" role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
