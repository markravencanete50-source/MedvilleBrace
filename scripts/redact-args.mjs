/*
  Command lines the deploy script echoes to the terminal. Some CloudFormation
  parameters work like passwords and must never be shown. The match is on the
  parameter name, argument by argument, so no pattern can fail to cover a value.

  Keep this list in step with the NoEcho parameters in
  aws/medville-brace-orders.yaml.
*/
const SECRET_PARAMETERS = ["DeployHookUrl"];

export function redactArgs(args) {
  return args.map((arg) => {
    const name = SECRET_PARAMETERS.find((key) => arg.startsWith(`${key}=`));
    return name ? `${name}=...` : arg;
  });
}
