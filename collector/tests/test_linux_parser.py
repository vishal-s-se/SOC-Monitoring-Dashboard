import json
import pytest
from collector.app.parser import parse_event_payload, parse_linux_event

def test_dynamic_routing():
    raw_payload = json.dumps({
        "raw_line": "Oct  9 12:34:56 kali sshd[12]: Failed password for admin from 192.168.1.100 port 22 ssh2",
        "filepath": "/var/log/auth.log"
    })
    result = parse_event_payload("linux_file_auth.log", raw_payload)
    assert result != {}
    assert result.get('event_category') == 'authentication'
    assert result.get('action') == 'login_failed'
    assert result.get('username') == 'admin'

def test_failed_password_normal_user():
    payload = {"message": "sshd[123]: Failed password for admin from 10.0.0.1 port 22"}
    result = parse_linux_event(payload)
    assert result.get('action') == 'login_failed'
    assert result.get('username') == 'admin'
    assert result.get('source_ip') == '10.0.0.1'
    assert result.get('event_category') == 'authentication'

def test_failed_password_invalid_user():
    payload = {"message": "sshd[123]: Failed password for invalid user root from 192.168.2.2 port 22 ssh2"}
    result = parse_linux_event(payload)
    assert result.get('action') == 'login_failed'
    assert result.get('username') == 'root'
    assert result.get('source_ip') == '192.168.2.2'

def test_successful_authentication():
    payload = {"message": "sshd[123]: Accepted password for jdoe from 172.16.0.5 port 22"}
    result = parse_linux_event(payload)
    assert result.get('action') == 'login_success'
    assert result.get('username') == 'jdoe'
    assert result.get('source_ip') == '172.16.0.5'
    assert result.get('event_category') == 'authentication'

def test_missing_username():
    payload = {"message": "sshd[123]: Failed password for from 10.0.0.1 port 22"}
    result = parse_linux_event(payload)
    assert result.get('action') == 'login_failed'
    # The split logic finds 'for' and 'from' but no words between them.
    assert result.get('username') is None
    assert result.get('source_ip') == '10.0.0.1'

def test_missing_source_ip():
    payload = {"message": "sshd[123]: Failed password for admin from"}
    result = parse_linux_event(payload)
    assert result.get('action') == 'login_failed'
    assert result.get('username') == 'admin'
    assert result.get('source_ip') is None

def test_malformed_source_ip():
    payload = {"message": "sshd[123]: Failed password for admin from not.an.ip port 22"}
    result = parse_linux_event(payload)
    assert result.get('action') == 'login_failed'
    assert result.get('username') == 'admin'
    assert result.get('source_ip') is None

def test_empty_or_malformed_payload():
    result1 = parse_event_payload("linux", "not a json string")
    assert result1 == {}
    
    result2 = parse_event_payload("linux", "[]")
    assert result2 == {}
    
    result3 = parse_linux_event({})
    assert result3 == {'event_category': 'linux'}

def test_backward_compatibility():
    payload = {"message": "Oct 10 12:00:00 srv sudo: jdoe : TTY=pts/0 ; PWD=/home/jdoe ; USER=root ; COMMAND=/bin/bash"}
    result = parse_linux_event(payload)
    assert result.get('event_category') == 'process'
    assert result.get('event_type') == 'sudo'
    assert result.get('action') == 'privilege_escalation'
