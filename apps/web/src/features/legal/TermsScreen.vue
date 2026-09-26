<script setup lang="ts">
import { RouterLink } from 'vue-router'
import LegalLayout from './LegalLayout.vue'
import { LEGAL_CONTACT_EMAIL, LEGAL_UPDATED } from './legal'
</script>

<template>
  <LegalLayout title="Terms of use" :updated="LEGAL_UPDATED">
    <p>
      By creating an account you agree to these terms. They are short because the service is simple:
      a free food and weight diary with computed targets and AI estimates.
    </p>

    <h2>Who can use it</h2>
    <p>
      You must be 18 or older. The app refuses a date of birth under 18 and is not designed for
      children.
    </p>

    <h2>Not medical advice</h2>
    <p>
      Targets, estimates, reviews and recalibration proposals are general guidance produced by
      formulas and by an AI model. They can be wrong. They are not medical, nutritional or
      psychological advice and do not replace a doctor or a dietitian. You decide what you eat.
    </p>

    <h2>Your account</h2>
    <ul>
      <li>
        Keep your password to yourself. You are responsible for what happens under your account.
      </li>
      <li>One person per account. Do not enter someone else's data without their consent.</li>
      <li>
        You can delete your account at any time from
        <RouterLink :to="{ name: 'settings' }">Settings</RouterLink>; everything goes with it.
      </li>
    </ul>

    <h2>Acceptable use</h2>
    <p>
      Do not try to break the service, access other people's data, or use the AI features to
      generate anything other than food estimates and reviews for your own diary. AI calls are
      capped per person per day to keep the service free.
    </p>

    <h2>Availability and changes</h2>
    <p>
      The service is provided as is, without warranties, and may change or stop at any time. If it
      stops, you will be able to export your data first where that is reasonably possible. We may
      update these terms; the date at the top says when.
    </p>

    <h2>Liability</h2>
    <p>
      To the extent the law allows, the people who run this service are not liable for any loss
      arising from its use, including from acting on a target, an estimate or a review.
    </p>

    <h2>Privacy</h2>
    <p>
      How your data is handled is in the
      <RouterLink :to="{ name: 'privacy' }">privacy policy</RouterLink>.
    </p>

    <h2>Contact</h2>
    <p v-if="LEGAL_CONTACT_EMAIL">
      <a :href="`mailto:${LEGAL_CONTACT_EMAIL}`">{{ LEGAL_CONTACT_EMAIL }}</a>
    </p>
    <p v-else>Contact the person who gave you the link to this app.</p>
  </LegalLayout>
</template>
