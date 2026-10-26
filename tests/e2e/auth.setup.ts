import { expect, test as setup } from "@playwright/test";

import { completeTestProfile, STUDENT_STATE, testSignIn } from "./support";

// Signs in once through the E2E test sign-in and saves the session for every device project.
setup("sign in the E2E student", async ({ request, baseURL }) => {
  const response = await testSignIn(request, baseURL!);
  expect(response.ok(), await response.text()).toBe(true);
  await completeTestProfile(request, baseURL!, "E2E000001");
  await request.storageState({ path: STUDENT_STATE });
});
