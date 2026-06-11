FROM grafana/k6:1.0.0

WORKDIR /synthetic

COPY scenarios ./scenarios
COPY flows ./flows
COPY lib ./lib

ENTRYPOINT ["k6"]
CMD ["run", "/synthetic/scenarios/external-smoke.js"]
